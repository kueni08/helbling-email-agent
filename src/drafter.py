"""
Antwortentwurf-Generator für das Helbling E-Mail-Verarbeitungssystem.
Generiert professionelle Antwortentwürfe auf Schweizer Hochdeutsch als HTML.
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .api_client import APIClient
from .classifier import Classification
from .eml_parser import ParsedEmail
from .knowledge import KnowledgeBase, KnowledgeChunk
from .thread_analyzer import ThreadAnalysis
from .utils import format_datetime

logger = logging.getLogger(__name__)

DRAFT_PROMPT = """\
Du bist der E-Mail-Assistent von Helbling & Co. AG, Rapperswil-Jona.
Erstelle einen professionellen Antwortentwurf auf Deutsch (Schweizer Hochdeutsch, kein ß).

WICHTIG: Gib den Antwortinhalt als HTML zurück. Verwende <p>-Tags für Absätze,
<strong> für Hervorhebungen, <ul>/<li> für Listen. Keine vollständige HTML-Seite,
nur den Body-Inhalt (ohne <html>, <head>, <body>-Tags).
Die Anrede und der Gruss werden separat eingefügt — schreibe NUR den Hauptinhalt.

## Thread-Verlauf & Analyse:
{thread_context}

## Offene Punkte:
{offene_punkte}

## Bereits besprochen/angeboten:
{bereits_angeboten}

## Erwarteter nächster Schritt:
{naechster_schritt}

## Kontext aus Wissensdatenbank:
{knowledge_context}

## Aktuelle E-Mail (zu beantworten):
Von: {from_addr}
Datum: {date}
Betreff: {subject}
Anhänge: {attachment_info}

{email_content}

## Klassifikation:
- Bereich: {bereich}
- Typ: {aktionstyp}
- Zusammenfassung: {zusammenfassung}
- Dringlichkeit: {dringlichkeit}

## Regeln für den Entwurf:
1. Bei Preisangaben: NUR Preise aus der Wissensdatenbank verwenden — bei unbekannten Preisen "[PRÜFEN: Preis]" schreiben
2. Bei Unsicherheiten: Rückfrage formulieren statt falsche Informationen geben
3. Markiere manuell zu prüfende Stellen mit [PRÜFEN: ...]
4. Beziehe dich auf den Verlauf wenn relevant (z.B. "Wie besprochen..." / "Bezugnehmend auf...")
5. Wiederhole KEINE Informationen die bereits im Verlauf gegeben wurden
6. Wenn Anhänge vorhanden: kurz erwähnen wo sinnvoll
7. KEIN "ß" — schreibe immer "ss"
8. Kurz und präzise — keine unnötigen Floskeln

Erstelle NUR den HTML-Inhalt (keine Anrede, kein Gruss, kein JSON, kein Kommentar):
"""

REFINE_PROMPT = """\
Du bist der E-Mail-Assistent von Helbling & Co. AG.
Der Benutzer möchte folgenden E-Mail-Entwurf verbessern.

## Aktueller Entwurf (HTML):
{current_html}

## Benutzer-Anweisung:
{instruction}

## Regeln:
1. Gib den verbesserten Entwurf als HTML zurück (nur Body-Inhalt, keine vollständige HTML-Seite)
2. KEIN "ß" — schreibe immer "ss"
3. Behalte die grundlegende Struktur bei, es sei denn der Benutzer wünscht etwas anderes
4. Markiere unsichere Stellen mit [PRÜFEN: ...]

Gib NUR den verbesserten HTML-Inhalt zurück (keine Erklärung):
"""

# Mapping von Aktionstyp zu Template-Datei
AKTIONSTYP_TEMPLATE_MAP = {
    "ANFRAGE": "anfrage",
    "ANGEBOT_ANFRAGE": "angebot",
    "REKLAMATION": "reklamation",
    "TERMIN": "termin",
    "NACHFASSEN": "nachfassen",
    "BESTELLUNG": "angebot",
    "INFO": "allgemein",
    "INTERN": "allgemein",
}


@dataclass
class DraftResult:
    """Ergebnis der Entwurfsgenerierung."""
    email_id: str
    subject: str
    recipient: str
    draft_text: str
    draft_html: str
    template_used: str
    signatur_key: str
    used_knowledge_sources: list
    classification_bereich: str
    classification_aktionstyp: str
    has_check_markers: bool
    refinement_history: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "email_id": self.email_id,
            "subject": self.subject,
            "recipient": self.recipient,
            "draft_text": self.draft_text,
            "draft_html": self.draft_html,
            "template_used": self.template_used,
            "signatur_key": self.signatur_key,
            "used_knowledge_sources": self.used_knowledge_sources,
            "classification_bereich": self.classification_bereich,
            "classification_aktionstyp": self.classification_aktionstyp,
            "has_check_markers": self.has_check_markers,
            "refinement_history": self.refinement_history,
        }


class Drafter:
    """Generiert Antwortentwürfe für E-Mails als HTML."""

    def __init__(
        self,
        api_client: APIClient,
        knowledge_base: KnowledgeBase,
        config: dict = None,
    ):
        self.api = api_client
        self.kb = knowledge_base
        self.config = config or {}

        drafts_cfg = self.config.get("drafts", {})
        self.signaturen = drafts_cfg.get("signaturen", {})
        self.default_signatur = drafts_cfg.get("default_signatur", "standard")
        self.bereich_signatur_map = drafts_cfg.get("bereich_signatur_mapping", {})
        self.templates_dir = Path(
            drafts_cfg.get("templates_dir", "./templates/drafts")
        )

        # Fallback für alte Konfiguration
        if not self.signaturen:
            old_sig = drafts_cfg.get("signatur", "Freundliche Grüsse\n\nHelbling & Co. AG")
            self.signaturen = {
                "standard": {"name": "Helbling & Co. AG", "text": old_sig, "html": f"<p>{old_sig}</p>"}
            }

    def get_signatur_for_bereich(self, bereich: str) -> str:
        """Gibt den Signatur-Key für einen Bereich zurück."""
        return self.bereich_signatur_map.get(bereich, self.default_signatur)

    def get_signatur_html(self, key: str) -> str:
        """Gibt die HTML-Signatur für einen Key zurück."""
        sig = self.signaturen.get(key, self.signaturen.get(self.default_signatur, {}))
        return sig.get("html", sig.get("text", ""))

    def get_signatur_text(self, key: str) -> str:
        """Gibt die Text-Signatur für einen Key zurück."""
        sig = self.signaturen.get(key, self.signaturen.get(self.default_signatur, {}))
        return sig.get("text", "")

    def get_all_signaturen(self) -> dict:
        """Gibt alle verfügbaren Signaturen zurück."""
        return {k: v.get("name", k) for k, v in self.signaturen.items()}

    def _load_template(self, aktionstyp: str) -> Optional[str]:
        """Lädt eine HTML-Vorlage basierend auf dem Aktionstyp."""
        template_name = AKTIONSTYP_TEMPLATE_MAP.get(aktionstyp, "allgemein")
        template_path = self.templates_dir / f"{template_name}.html"
        if template_path.exists():
            return template_path.read_text(encoding="utf-8")
        logger.warning(f"Template nicht gefunden: {template_path}")
        return None

    def _build_html_draft(
        self,
        template_html: str,
        anrede: str,
        inhalt_html: str,
        signatur_html: str,
        betreff: str,
    ) -> str:
        """Setzt den HTML-Entwurf aus Template, Inhalt und Signatur zusammen."""
        html = template_html
        html = html.replace("{{anrede}}", anrede)
        html = html.replace("{{inhalt}}", inhalt_html)
        html = html.replace("{{signatur}}", signatur_html)
        html = html.replace("{{betreff}}", betreff)
        return html

    def generate_draft(
        self,
        parsed_email: ParsedEmail,
        thread_analysis: ThreadAnalysis,
        classification: Classification,
        knowledge_chunks: Optional[list] = None,
        signatur_key: Optional[str] = None,
    ) -> DraftResult:
        """Generiert einen Antwortentwurf als HTML."""
        # Relevante Wissens-Chunks laden wenn nicht übergeben
        if knowledge_chunks is None:
            query = f"{parsed_email.subject} {classification.bereich} {classification.aktionstyp}"
            knowledge_chunks = self.kb.retrieve(
                query,
                top_k=5,
                category=classification.bereich.lower(),
            )

        knowledge_context = self.kb.format_for_prompt(knowledge_chunks)
        knowledge_sources = [c.source_file for c in (knowledge_chunks or [])]

        # Thread-Kontext formatieren
        thread_context = self._format_thread_context(thread_analysis)

        # Anhang-Info
        attachment_info = "Keine"
        if parsed_email.attachments:
            att_list = [f"{a.filename} ({a.size_bytes // 1024} KB)"
                       for a in parsed_email.attachments]
            attachment_info = ", ".join(att_list)

        # E-Mail-Content
        email_content = parsed_email.body_plain[:2000]
        if len(parsed_email.body_plain) > 2000:
            email_content += "\n[... Text gekürzt ...]"

        date_str = format_datetime(parsed_email.date) if parsed_email.date else "Unbekannt"

        # Signatur bestimmen
        if signatur_key is None:
            signatur_key = self.get_signatur_for_bereich(classification.bereich)
        signatur_text = self.get_signatur_text(signatur_key)

        prompt = DRAFT_PROMPT.format(
            thread_context=thread_context,
            offene_punkte=(
                "\n".join(f"- {p}" for p in thread_analysis.offene_punkte)
                if thread_analysis.offene_punkte else "Keine offenen Punkte."
            ),
            bereits_angeboten=(
                "\n".join(f"- {p}" for p in thread_analysis.bereits_angeboten)
                if thread_analysis.bereits_angeboten else "Noch nichts besprochen."
            ),
            naechster_schritt=thread_analysis.naechster_schritt or "Antwort auf Anfrage",
            knowledge_context=knowledge_context,
            from_addr=parsed_email.from_addr,
            date=date_str,
            subject=parsed_email.subject,
            attachment_info=attachment_info,
            email_content=email_content,
            bereich=classification.bereich,
            aktionstyp=classification.aktionstyp,
            zusammenfassung=classification.zusammenfassung,
            dringlichkeit=classification.dringlichkeit,
        )

        try:
            inhalt_html = self.api.complete(prompt, max_tokens=1500)
        except Exception as e:
            logger.error(f"Fehler beim Generieren des Entwurfs: {e}")
            inhalt_html = self._fallback_inhalt(parsed_email, classification)

        # Template laden und zusammensetzen
        template_name = AKTIONSTYP_TEMPLATE_MAP.get(classification.aktionstyp, "allgemein")
        template_html = self._load_template(classification.aktionstyp)
        signatur_html = self.get_signatur_html(signatur_key)

        if template_html:
            anrede = "Sehr geehrte Damen und Herren,"
            draft_html = self._build_html_draft(
                template_html, anrede, inhalt_html, signatur_html, parsed_email.subject
            )
        else:
            # Fallback: einfaches HTML
            draft_html = (
                f'<p>Sehr geehrte Damen und Herren,</p>\n'
                f'{inhalt_html}\n'
                f'{signatur_html}'
            )

        # Plain-Text Version
        draft_text = self._html_to_text(inhalt_html, signatur_text)

        has_check_markers = "[PRÜFEN:" in draft_html or "[PRÜFEN:" in draft_text

        result = DraftResult(
            email_id=parsed_email.email_id,
            subject=f"Re: {parsed_email.subject}",
            recipient=parsed_email.from_addr,
            draft_text=draft_text,
            draft_html=draft_html,
            template_used=template_name,
            signatur_key=signatur_key,
            used_knowledge_sources=knowledge_sources,
            classification_bereich=classification.bereich,
            classification_aktionstyp=classification.aktionstyp,
            has_check_markers=has_check_markers,
        )

        logger.info(
            f"Entwurf generiert für: {parsed_email.subject} "
            f"(Template: {template_name}, Signatur: {signatur_key}, "
            f"{'mit' if has_check_markers else 'ohne'} PRÜFEN-Marker)"
        )
        return result

    def refine_draft(self, current_html: str, instruction: str) -> str:
        """Verfeinert einen bestehenden Entwurf basierend auf Benutzer-Anweisung."""
        prompt = REFINE_PROMPT.format(
            current_html=current_html,
            instruction=instruction,
        )
        return self.api.complete(prompt, max_tokens=1500)

    def _format_thread_context(self, ta: ThreadAnalysis) -> str:
        """Formatiert den Thread-Kontext für den Prompt."""
        if ta.anzahl_nachrichten <= 1:
            return "Erste Kontaktaufnahme, kein vorheriger Verlauf."

        return (
            f"Zusammenfassung: {ta.zusammenfassung}\n"
            f"Teilnehmer: {', '.join(ta.teilnehmer)}\n"
            f"Tonalität: {ta.tonalitaet}\n"
            f"Kontext: {ta.kontext_fuer_antwort}"
        )

    def _fallback_inhalt(
        self, parsed_email: ParsedEmail, classification: Classification
    ) -> str:
        """Fallback-Inhalt wenn API nicht verfügbar."""
        return (
            f"<p>Vielen Dank für Ihre E-Mail vom [PRÜFEN: Datum] "
            f"zum Thema &laquo;{parsed_email.subject}&raquo;.</p>\n"
            f"<p>[PRÜFEN: Antwort auf die Anfrage formulieren]</p>"
        )

    def _html_to_text(self, inhalt_html: str, signatur_text: str) -> str:
        """Einfache Konversion von HTML zu Text."""
        import re
        text = inhalt_html
        text = re.sub(r'<br\s*/?>', '\n', text)
        text = re.sub(r'</p>\s*<p', '\n\n<p', text)
        text = re.sub(r'<li>', '- ', text)
        text = re.sub(r'</li>', '\n', text)
        text = re.sub(r'<[^>]+>', '', text)
        text = re.sub(r'&amp;', '&', text)
        text = re.sub(r'&laquo;', '«', text)
        text = re.sub(r'&raquo;', '»', text)
        text = re.sub(r'&lt;', '<', text)
        text = re.sub(r'&gt;', '>', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return f"Sehr geehrte Damen und Herren,\n\n{text.strip()}\n\n{signatur_text}"
