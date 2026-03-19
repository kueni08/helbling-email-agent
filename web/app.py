"""
Flask Web-Dashboard für das Helbling E-Mail-Verarbeitungssystem.
Läuft lokal auf http://localhost:5000
"""

import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory
from werkzeug.utils import secure_filename

# Projektroot zum Pfad hinzufügen
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def create_app(config: dict = None) -> Flask:
    """Erstellt die Flask-App."""
    if config is None:
        from src.utils import load_config
        config = load_config(str(project_root / "config.yaml"))

    app = Flask(
        __name__,
        template_folder=str(Path(__file__).parent / "templates"),
        static_folder=str(Path(__file__).parent / "static"),
    )
    app.config["SECRET_KEY"] = "helbling-email-agent-2026"
    app.config["HELBLING_CONFIG"] = config
    app.config["JSON_AS_ASCII"] = False

    @app.after_request
    def set_utf8_header(response):
        if response.content_type and "json" in response.content_type:
            response.headers["Content-Type"] = "application/json; charset=utf-8"
        return response

    from src.utils import resolve_path
    paths = config.get("paths", {})
    output_path = resolve_path(paths.get("output", "./output"))
    kb_path = resolve_path(paths.get("knowledge_base", "./knowledge_base"))
    inbox_path = resolve_path(paths.get("inbox", "./inbox"))

    # ---- Hilfsfunktionen ----

    def get_all_results() -> list:
        """Lädt alle verarbeiteten E-Mail-Ergebnisse (nur gültige, nicht gelöschte)."""
        results_file = output_path / "logs" / "all_results.json"
        if not results_file.exists():
            return []
        try:
            with open(results_file, encoding="utf-8") as f:
                data = json.load(f)
            return [r for r in data if r.get("email_id") and not r.get("deleted")]
        except Exception:
            return []

    def get_all_drafts() -> list:
        """Lädt alle generierten Entwürfe."""
        drafts_dir = output_path / "drafts"
        drafts = []
        if not drafts_dir.exists():
            return drafts
        for f in sorted(drafts_dir.glob("*_draft.json"), key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                with open(f, encoding="utf-8") as fp:
                    draft = json.load(fp)
                    draft["file_id"] = f.stem.replace("_draft", "")
                    drafts.append(draft)
            except Exception:
                pass
        return drafts

    def get_all_tasks() -> list:
        """Lädt alle Aufgaben."""
        tasks_dir = output_path / "tasks"
        tasks = []
        if not tasks_dir.exists():
            return tasks
        for f in sorted(tasks_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                with open(f, encoding="utf-8") as fp:
                    task = json.load(fp)
                    tasks.append(task)
            except Exception:
                pass
        return tasks

    def get_kb_status() -> dict:
        """Lädt den Status der Wissensdatenbank."""
        try:
            from src.knowledge import KnowledgeBase
            kb = KnowledgeBase(config)
            kb.load()
            return kb.get_status()
        except Exception as e:
            return {"error": str(e), "total_chunks": 0}

    def get_kb_files() -> list:
        """Listet alle Dateien der Wissensdatenbank auf."""
        files = []
        if not kb_path.exists():
            return files
        for f in sorted(kb_path.rglob("*")):
            if not f.is_file() or f.name.startswith("."):
                continue
            if f.suffix.lower() not in (".md", ".txt", ".csv", ".json", ".pdf", ".xlsx",
                                         ".docx", ".pptx", ".png"):
                continue
            rel = f.relative_to(kb_path)
            parts = rel.parts
            cat = "allgemein"
            if any("sibox" in p.lower() for p in parts):
                cat = "sibox"
            elif any("facettestar" in p.lower() for p in parts):
                cat = "facettestar"
            source_type = "web" if "web_cache" in str(rel) else "lokal"
            files.append({
                "name": f.name,
                "path": str(rel),
                "category": cat,
                "source_type": source_type,
                "size_kb": round(f.stat().st_size / 1024, 1),
                "modified": datetime.fromtimestamp(f.stat().st_mtime).strftime("%d.%m.%Y %H:%M"),
            })
        return files

    # ---- Routen ----

    @app.route("/")
    def index():
        return render_template("index.html")

    # ---- CONFIG / PIPELINE / SIGNATUREN ----

    @app.route("/api/config/pipeline")
    def api_pipeline_config():
        """Gibt die Pipeline-Konfiguration zurück."""
        pipeline = config.get("pipeline", {})
        return jsonify(pipeline)

    @app.route("/api/config/signaturen")
    def api_signaturen():
        """Gibt alle verfügbaren Signaturen zurück."""
        drafts_cfg = config.get("drafts", {})
        signaturen = drafts_cfg.get("signaturen", {})
        result = {}
        for key, sig in signaturen.items():
            result[key] = {
                "name": sig.get("name", key),
                "html": sig.get("html", ""),
            }
        return jsonify({
            "signaturen": result,
            "default": drafts_cfg.get("default_signatur", "standard"),
            "bereich_mapping": drafts_cfg.get("bereich_signatur_mapping", {}),
        })

    # ---- STATS ----

    @app.route("/api/stats")
    def api_stats():
        """Statistik-Daten."""
        results = get_all_results()
        tasks = get_all_tasks()
        drafts = get_all_drafts()

        by_bereich = {}
        by_aktionstyp = {}
        today_count = 0
        today = datetime.now().strftime("%Y-%m-%d")

        for r in results:
            clf = r.get("classification") or {}
            bereich = clf.get("bereich", "ALLGEMEIN")
            aktionstyp = clf.get("aktionstyp", "INFO")
            by_bereich[bereich] = by_bereich.get(bereich, 0) + 1
            by_aktionstyp[aktionstyp] = by_aktionstyp.get(aktionstyp, 0) + 1
            if r.get("processed_at", "").startswith(today):
                today_count += 1

        open_tasks = [t for t in tasks if t.get("status") == "offen"]
        high_prio = [t for t in open_tasks if t.get("prioritaet") == "hoch"]

        feedback_gut = sum(1 for d in drafts if d.get("feedback_rating") == "gut")
        feedback_schlecht = sum(1 for d in drafts if d.get("feedback_rating") == "schlecht")
        drafts_with_markers = sum(1 for d in drafts if d.get("has_check_markers"))

        return jsonify({
            "total_emails": len(results),
            "total_drafts": len(drafts),
            "total_tasks": len(tasks),
            "open_tasks": len(open_tasks),
            "high_prio_tasks": len(high_prio),
            "today_emails": today_count,
            "by_bereich": by_bereich,
            "by_aktionstyp": by_aktionstyp,
            "feedback_gut": feedback_gut,
            "feedback_schlecht": feedback_schlecht,
            "drafts_with_markers": drafts_with_markers,
        })

    # ---- EMAILS ----

    @app.route("/api/emails")
    def api_emails():
        """Liste verarbeiteter E-Mails."""
        results = get_all_results()
        # Anhang-Info hinzufuegen
        for r in results:
            eid = r.get("email_id")
            if eid:
                att_dir = output_path / "attachments" / eid
                r["has_attachments"] = att_dir.exists() and any(att_dir.iterdir()) if att_dir.exists() else False
        return jsonify(results)

    @app.route("/api/emails/<email_id>")
    def api_email_detail(email_id):
        """Detail einer verarbeiteten E-Mail."""
        result_path = output_path / "logs" / f"{email_id}.json"
        if result_path.exists():
            with open(result_path, encoding="utf-8") as f:
                return jsonify(json.load(f))
        for r in get_all_results():
            if r.get("email_id") == email_id:
                return jsonify(r)
        return jsonify({"error": "Nicht gefunden"}), 404

    @app.route("/api/emails/<email_id>/attachments")
    def api_email_attachments(email_id):
        """Listet Anhaenge einer E-Mail auf."""
        att_dir = output_path / "attachments" / email_id
        if not att_dir.exists():
            return jsonify([])
        files = []
        for f in sorted(att_dir.iterdir()):
            if f.is_file():
                files.append({
                    "filename": f.name,
                    "size_kb": round(f.stat().st_size / 1024, 1),
                    "download_url": f"/api/emails/{email_id}/attachments/{f.name}",
                })
        return jsonify(files)

    @app.route("/api/emails/<email_id>/attachments/<path:filename>")
    def api_email_attachment_download(email_id, filename):
        """Download eines Anhangs."""
        att_dir = output_path / "attachments" / email_id
        safe_name = secure_filename(filename)
        return send_from_directory(str(att_dir), safe_name)

    @app.route("/api/emails/<email_id>/delete", methods=["POST"])
    def api_email_delete(email_id):
        """Löscht eine verarbeitete E-Mail (Hard-Delete aus Listen, Dateien verschieben)."""
        # 1. Individuelle Ergebnis-JSON löschen
        result_path = output_path / "logs" / f"{email_id}.json"
        if result_path.exists():
            result_path.unlink()

        # 2. Aus all_results.json entfernen
        results_file = output_path / "logs" / "all_results.json"
        if results_file.exists():
            try:
                with open(results_file, encoding="utf-8") as f:
                    all_results = json.load(f)
                all_results = [r for r in all_results if r.get("email_id") != email_id]
                with open(results_file, "w", encoding="utf-8") as f:
                    json.dump(all_results, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

        # 3. Draft-Dateien löschen
        for ext in ("_draft.json", "_draft.html", "_draft.md"):
            p = output_path / "drafts" / f"{email_id}{ext}"
            if p.exists():
                p.unlink()

        # 4. .eml-Datei verschieben
        _move_eml_to_deleted(email_id)

        # 5. Aus processed_emails.json entfernen
        processed_log = output_path / "logs" / "processed_emails.json"
        if processed_log.exists():
            try:
                with open(processed_log, encoding="utf-8") as f:
                    log = json.load(f)
                log.pop(email_id, None)
                with open(processed_log, "w", encoding="utf-8") as f:
                    json.dump(log, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

        return jsonify({"ok": True, "email_id": email_id})

    @app.route("/api/emails/delete-all", methods=["POST"])
    def api_emails_delete_all():
        """Löscht alle verarbeiteten E-Mails."""
        results = get_all_results()
        count = 0
        for r in results:
            eid = r.get("email_id")
            if eid:
                # Individuelle JSON löschen
                p = output_path / "logs" / f"{eid}.json"
                if p.exists():
                    p.unlink()
                # Draft-Dateien löschen
                for ext in ("_draft.json", "_draft.html", "_draft.md"):
                    dp = output_path / "drafts" / f"{eid}{ext}"
                    if dp.exists():
                        dp.unlink()
                count += 1

        # all_results.json leeren
        results_file = output_path / "logs" / "all_results.json"
        if results_file.exists():
            with open(results_file, "w", encoding="utf-8") as f:
                json.dump([], f)

        # processed_emails.json leeren
        processed_log = output_path / "logs" / "processed_emails.json"
        if processed_log.exists():
            with open(processed_log, "w", encoding="utf-8") as f:
                json.dump({}, f)

        # Alle Tasks löschen
        tasks_dir = output_path / "tasks"
        if tasks_dir.exists():
            for f in tasks_dir.glob("*.json"):
                f.unlink()
            for f in tasks_dir.glob("*.md"):
                f.unlink()

        return jsonify({"ok": True, "deleted": count})

    def _move_eml_to_deleted(email_id):
        """Verschiebt die .eml-Datei in den gelöscht-Ordner."""
        processed_log = output_path / "logs" / "processed_emails.json"
        if processed_log.exists():
            try:
                with open(processed_log, encoding="utf-8") as f:
                    log = json.load(f)
                entry = log.get(email_id, {})
                eml_path = Path(entry.get("file", ""))
                if eml_path.exists():
                    geloescht_dir = inbox_path / "geloescht"
                    geloescht_dir.mkdir(exist_ok=True)
                    dest = geloescht_dir / eml_path.name
                    if dest.exists():
                        dest = geloescht_dir / f"{eml_path.stem}_{email_id[:8]}{eml_path.suffix}"
                    shutil.move(str(eml_path), str(dest))
                    return
            except Exception:
                pass

        # Auch in erfasst/ suchen
        erfasst_dir = inbox_path / "erfasst"
        if erfasst_dir.exists():
            from src.utils import get_email_id
            for eml_file in erfasst_dir.glob("*.eml"):
                if get_email_id(str(eml_file)) == email_id:
                    geloescht_dir = inbox_path / "geloescht"
                    geloescht_dir.mkdir(exist_ok=True)
                    dest = geloescht_dir / eml_file.name
                    if dest.exists():
                        dest = geloescht_dir / f"{eml_file.stem}_{email_id[:8]}{eml_file.suffix}"
                    shutil.move(str(eml_file), str(dest))
                    break

    # ---- DRAFTS ----

    @app.route("/api/drafts")
    def api_drafts():
        """Liste der Entwürfe."""
        return jsonify(get_all_drafts())

    @app.route("/api/drafts/<file_id>")
    def api_draft_detail(file_id):
        """Detail eines Entwurfs."""
        draft_path = output_path / "drafts" / f"{file_id}_draft.json"
        if not draft_path.exists():
            return jsonify({"error": "Nicht gefunden"}), 404
        with open(draft_path, encoding="utf-8") as f:
            return jsonify(json.load(f))

    @app.route("/api/drafts/<file_id>/html")
    def api_draft_html(file_id):
        """Gibt den HTML-Entwurf zurück."""
        html_path = output_path / "drafts" / f"{file_id}_draft.html"
        if not html_path.exists():
            # Fallback: HTML aus JSON
            draft_path = output_path / "drafts" / f"{file_id}_draft.json"
            if draft_path.exists():
                with open(draft_path, encoding="utf-8") as f:
                    draft = json.load(f)
                return jsonify({"html": draft.get("draft_html", draft.get("draft_text", ""))})
            return jsonify({"error": "Nicht gefunden"}), 404
        with open(html_path, encoding="utf-8") as f:
            return jsonify({"html": f.read()})

    @app.route("/api/drafts/<file_id>/text")
    def api_draft_text(file_id):
        """Gibt den Markdown-Text eines Entwurfs zurück."""
        md_path = output_path / "drafts" / f"{file_id}_draft.md"
        if not md_path.exists():
            return jsonify({"error": "Nicht gefunden"}), 404
        with open(md_path, encoding="utf-8") as f:
            return jsonify({"text": f.read()})

    @app.route("/api/drafts/<file_id>/feedback", methods=["POST"])
    def api_draft_feedback(file_id):
        """Speichert Feedback zu einem Entwurf."""
        draft_path = output_path / "drafts" / f"{file_id}_draft.json"
        if not draft_path.exists():
            return jsonify({"error": "Nicht gefunden"}), 404
        data = request.get_json() or {}
        rating = data.get("rating")
        comment = data.get("comment", "")

        with open(draft_path, encoding="utf-8") as f:
            draft = json.load(f)

        draft["feedback_rating"] = rating
        draft["feedback_comment"] = comment
        draft["feedback_at"] = datetime.now().isoformat()

        with open(draft_path, "w", encoding="utf-8") as f:
            json.dump(draft, f, ensure_ascii=False, indent=2)

        # Feedback-Log
        feedback_log = output_path / "logs" / "draft_feedback.json"
        log_entries = []
        if feedback_log.exists():
            try:
                with open(feedback_log, encoding="utf-8") as f:
                    log_entries = json.load(f)
            except Exception:
                pass
        log_entries.append({
            "email_id": file_id,
            "rating": rating,
            "comment": comment,
            "timestamp": datetime.now().isoformat(),
            "bereich": draft.get("classification_bereich"),
            "aktionstyp": draft.get("classification_aktionstyp"),
        })
        with open(feedback_log, "w", encoding="utf-8") as f:
            json.dump(log_entries, f, ensure_ascii=False, indent=2)

        return jsonify({"ok": True})

    @app.route("/api/drafts/<file_id>/edit", methods=["POST"])
    def api_draft_edit(file_id):
        """Speichert einen manuell bearbeiteten Entwurf (HTML)."""
        draft_path = output_path / "drafts" / f"{file_id}_draft.json"
        if not draft_path.exists():
            return jsonify({"error": "Nicht gefunden"}), 404
        data = request.get_json() or {}
        new_html = data.get("html", "")
        new_signatur = data.get("signatur_key", "")
        if not new_html:
            return jsonify({"error": "Kein HTML"}), 400

        with open(draft_path, encoding="utf-8") as f:
            draft = json.load(f)
        draft["draft_html_edited"] = new_html
        draft["edited_at"] = datetime.now().isoformat()
        if new_signatur:
            draft["signatur_key"] = new_signatur

        with open(draft_path, "w", encoding="utf-8") as f:
            json.dump(draft, f, ensure_ascii=False, indent=2)

        # HTML-Datei aktualisieren
        html_path = output_path / "drafts" / f"{file_id}_draft.html"
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(new_html)

        return jsonify({"ok": True})

    @app.route("/api/drafts/<file_id>/refine", methods=["POST"])
    def api_draft_refine(file_id):
        """Verfeinert einen Entwurf via Claude API."""
        draft_path = output_path / "drafts" / f"{file_id}_draft.json"
        if not draft_path.exists():
            return jsonify({"error": "Nicht gefunden"}), 404

        data = request.get_json() or {}
        instruction = data.get("instruction", "")
        current_html = data.get("current_html", "")

        if not instruction:
            return jsonify({"error": "Keine Anweisung"}), 400

        # Aktuellen HTML laden falls nicht mitgegeben
        if not current_html:
            html_path = output_path / "drafts" / f"{file_id}_draft.html"
            if html_path.exists():
                with open(html_path, encoding="utf-8") as f:
                    current_html = f.read()
            else:
                with open(draft_path, encoding="utf-8") as f:
                    draft = json.load(f)
                current_html = draft.get("draft_html_edited", draft.get("draft_html", draft.get("draft_text", "")))

        try:
            from src.api_client import APIClient
            from src.drafter import Drafter
            from src.knowledge import KnowledgeBase

            api = APIClient(config)
            kb = KnowledgeBase(config)
            drafter = Drafter(api, kb, config)
            refined_html = drafter.refine_draft(current_html, instruction)

            # Verfeinerung speichern
            with open(draft_path, encoding="utf-8") as f:
                draft = json.load(f)

            if "refinement_history" not in draft:
                draft["refinement_history"] = []
            draft["refinement_history"].append({
                "instruction": instruction,
                "timestamp": datetime.now().isoformat(),
            })
            draft["draft_html_edited"] = refined_html
            draft["edited_at"] = datetime.now().isoformat()

            with open(draft_path, "w", encoding="utf-8") as f:
                json.dump(draft, f, ensure_ascii=False, indent=2)

            # HTML-Datei aktualisieren
            html_path = output_path / "drafts" / f"{file_id}_draft.html"
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(refined_html)

            return jsonify({"ok": True, "refined_html": refined_html})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/drafts/<file_id>/delete", methods=["POST"])
    def api_draft_delete(file_id):
        """Löscht einen einzelnen Entwurf."""
        for ext in ("_draft.json", "_draft.html", "_draft.md"):
            p = output_path / "drafts" / f"{file_id}{ext}"
            if p.exists():
                p.unlink()
        return jsonify({"ok": True})

    @app.route("/api/drafts/delete-all", methods=["POST"])
    def api_drafts_delete_all():
        """Löscht alle Entwürfe."""
        drafts_dir = output_path / "drafts"
        count = 0
        if drafts_dir.exists():
            for f in drafts_dir.glob("*_draft.*"):
                f.unlink()
                count += 1
        return jsonify({"ok": True, "deleted": count})

    # ---- TASKS ----

    @app.route("/api/tasks")
    def api_tasks():
        """Liste der Aufgaben."""
        tasks = get_all_tasks()
        status_filter = request.args.get("status")
        bereich_filter = request.args.get("bereich")
        if status_filter:
            tasks = [t for t in tasks if t.get("status") == status_filter]
        if bereich_filter:
            tasks = [t for t in tasks if t.get("bereich") == bereich_filter]
        return jsonify(tasks)

    @app.route("/api/tasks/<task_id>", methods=["GET"])
    def api_task_detail(task_id):
        """Detail einer Aufgabe."""
        task_path = output_path / "tasks" / f"{task_id}.json"
        if not task_path.exists():
            return jsonify({"error": "Nicht gefunden"}), 404
        with open(task_path, encoding="utf-8") as f:
            return jsonify(json.load(f))

    @app.route("/api/tasks/<task_id>/status", methods=["POST"])
    def api_task_status(task_id):
        """Setzt den Status einer Aufgabe."""
        task_path = output_path / "tasks" / f"{task_id}.json"
        if not task_path.exists():
            return jsonify({"error": "Nicht gefunden"}), 404
        data = request.get_json()
        new_status = data.get("status", "offen")
        with open(task_path, encoding="utf-8") as f:
            task = json.load(f)
        task["status"] = new_status
        with open(task_path, "w", encoding="utf-8") as f:
            json.dump(task, f, ensure_ascii=False, indent=2)
        return jsonify({"ok": True, "status": new_status})

    @app.route("/api/tasks/<task_id>/delete", methods=["POST"])
    def api_task_delete(task_id):
        """Löscht eine einzelne Aufgabe."""
        for ext in (".json", ".md"):
            p = output_path / "tasks" / f"{task_id}{ext}"
            if p.exists():
                p.unlink()
        return jsonify({"ok": True})

    @app.route("/api/tasks/delete-all", methods=["POST"])
    def api_tasks_delete_all():
        """Löscht alle Aufgaben."""
        tasks_dir = output_path / "tasks"
        count = 0
        if tasks_dir.exists():
            for f in tasks_dir.glob("*"):
                if f.is_file():
                    f.unlink()
                    count += 1
        return jsonify({"ok": True, "deleted": count})

    # ---- KNOWLEDGE ----

    @app.route("/api/knowledge/status")
    def api_knowledge_status():
        """Status der Wissensdatenbank."""
        return jsonify(get_kb_status())

    @app.route("/api/knowledge/files")
    def api_knowledge_files():
        """Liste aller Wissensdatenbank-Dateien."""
        return jsonify(get_kb_files())

    @app.route("/api/knowledge/web-status")
    def api_knowledge_web_status():
        """Status der Web-Quellen."""
        try:
            from src.web_scraper import WebScraper
            scraper = WebScraper(config)
            return jsonify(scraper.get_status())
        except Exception as e:
            return jsonify({"error": str(e)})

    @app.route("/api/knowledge/scrape", methods=["POST"])
    def api_knowledge_scrape():
        """Startet Web-Scraping."""
        data = request.get_json() or {}
        source = data.get("source")
        force = data.get("force", False)
        try:
            from src.web_scraper import WebScraper
            scraper = WebScraper(config)
            if source:
                scraper.scrape_source(source)
            else:
                scraper.scrape_all(force=force)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/knowledge/reload", methods=["POST"])
    def api_knowledge_reload():
        """Lädt Wissensdatenbank neu."""
        try:
            from src.knowledge import KnowledgeBase
            kb = KnowledgeBase(config)
            kb.load(force=True)
            status = kb.get_status()
            return jsonify({"ok": True, **status})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ---- TEMPLATES (VORLAGEN) ----

    templates_dir = resolve_path(config.get("drafts", {}).get("templates_dir", "./templates/drafts"))

    @app.route("/api/templates")
    def api_templates():
        """Liste aller E-Mail-Vorlagen."""
        templates = []
        if not templates_dir.exists():
            return jsonify(templates)
        for f in sorted(templates_dir.glob("*.html")):
            name = f.stem
            # Typ-Erkennung aus Dateinamen
            typ_map = {
                "anfrage": "Anfrage", "angebot": "Angebot", "reklamation": "Reklamation",
                "termin": "Termin", "nachfassen": "Nachfassen", "allgemein": "Allgemein",
            }
            typ = typ_map.get(name, "Benutzerdefiniert")
            templates.append({
                "name": name,
                "filename": f.name,
                "type": typ,
                "size_kb": round(f.stat().st_size / 1024, 1),
                "modified": datetime.fromtimestamp(f.stat().st_mtime).strftime("%d.%m.%Y %H:%M"),
            })
        return jsonify(templates)

    @app.route("/api/templates/<name>")
    def api_template_detail(name):
        """Gibt den Inhalt einer Vorlage zurück."""
        tpl_path = templates_dir / f"{name}.html"
        if not tpl_path.exists():
            return jsonify({"error": "Vorlage nicht gefunden"}), 404
        with open(tpl_path, encoding="utf-8") as f:
            html = f.read()
        return jsonify({"name": name, "html": html, "filename": f"{name}.html"})

    @app.route("/api/templates/<name>", methods=["POST"])
    def api_template_save(name):
        """Speichert eine Vorlage (erstellen oder aktualisieren)."""
        data = request.get_json() or {}
        html = data.get("html", "")
        if not html:
            return jsonify({"error": "Kein HTML-Inhalt"}), 400
        templates_dir.mkdir(parents=True, exist_ok=True)
        tpl_path = templates_dir / f"{name}.html"
        with open(tpl_path, "w", encoding="utf-8") as f:
            f.write(html)
        return jsonify({"ok": True, "name": name})

    @app.route("/api/templates", methods=["POST"])
    def api_template_create():
        """Erstellt eine neue Vorlage."""
        data = request.get_json() or {}
        name = data.get("name", "").strip()
        html = data.get("html", "")
        if not name:
            return jsonify({"error": "Kein Name angegeben"}), 400
        # Sicherheit: nur alphanumerisch und Unterstriche
        safe_name = "".join(c for c in name if c.isalnum() or c in ("_", "-"))
        if not safe_name:
            return jsonify({"error": "Ungültiger Name"}), 400
        templates_dir.mkdir(parents=True, exist_ok=True)
        tpl_path = templates_dir / f"{safe_name}.html"
        if tpl_path.exists():
            return jsonify({"error": "Vorlage existiert bereits"}), 409
        with open(tpl_path, "w", encoding="utf-8") as f:
            f.write(html)
        return jsonify({"ok": True, "name": safe_name})

    @app.route("/api/templates/<name>/delete", methods=["POST"])
    def api_template_delete(name):
        """Löscht eine Vorlage."""
        tpl_path = templates_dir / f"{name}.html"
        if tpl_path.exists():
            tpl_path.unlink()
        return jsonify({"ok": True})

    # ---- RULES (Geschaeftslogik-Regeln) ----

    rules_file = output_path / "product_rules.json"

    def _load_rules() -> list:
        """Laedt alle Regeln."""
        if not rules_file.exists():
            return []
        try:
            with open(rules_file, encoding="utf-8") as f:
                data = json.load(f)
            return data.get("rules", [])
        except Exception:
            return []

    def _save_rules(rules: list):
        """Speichert alle Regeln."""
        rules_file.parent.mkdir(parents=True, exist_ok=True)
        with open(rules_file, "w", encoding="utf-8") as f:
            json.dump({"rules": rules}, f, ensure_ascii=False, indent=2)

    @app.route("/api/rules")
    def api_rules():
        """Liste aller Regeln."""
        return jsonify(_load_rules())

    @app.route("/api/rules/confirm", methods=["POST"])
    def api_rules_confirm():
        """Speichert eine vorgeschlagene Regel."""
        data = request.get_json() or {}
        name = data.get("name", "").strip()
        if not name:
            return jsonify({"error": "Kein Name"}), 400

        rules = _load_rules()
        import random
        rule_id = f"rule-{random.randint(1000, 9999)}"
        rule = {
            "id": rule_id,
            "name": name,
            "beschreibung": data.get("beschreibung", ""),
            "bedingung": data.get("bedingung", ""),
            "aktion": data.get("aktion", ""),
            "aktiv": True,
            "erstellt_am": datetime.now().isoformat(),
        }
        rules.append(rule)
        _save_rules(rules)
        return jsonify({"ok": True, "rule": rule})

    @app.route("/api/rules/<rule_id>/toggle", methods=["POST"])
    def api_rules_toggle(rule_id):
        """Aktiviert/deaktiviert eine Regel."""
        data = request.get_json() or {}
        rules = _load_rules()
        for r in rules:
            if r.get("id") == rule_id:
                r["aktiv"] = data.get("aktiv", not r.get("aktiv", True))
                _save_rules(rules)
                return jsonify({"ok": True})
        return jsonify({"error": "Nicht gefunden"}), 404

    @app.route("/api/rules/<rule_id>/delete", methods=["POST"])
    def api_rules_delete(rule_id):
        """Loescht eine Regel."""
        rules = _load_rules()
        rules = [r for r in rules if r.get("id") != rule_id]
        _save_rules(rules)
        return jsonify({"ok": True})

    @app.route("/api/rules/chat", methods=["POST"])
    def api_rules_chat():
        """Chat-basierte Regelerstellung via Claude."""
        data = request.get_json() or {}
        message = data.get("message", "").strip()
        history = data.get("history", [])
        if not message:
            return jsonify({"error": "Keine Nachricht"}), 400

        # Bestehende Regeln als Kontext
        existing_rules = _load_rules()
        rules_context = ""
        if existing_rules:
            rules_context = "Bestehende Regeln:\n" + "\n".join(
                f"- {r['name']}: {r.get('beschreibung', '')}" for r in existing_rules
            )

        prompt = f"""\
Du bist ein Assistent fuer die Konfiguration von Geschaeftslogik-Regeln bei Helbling & Co. AG (Schluesselboxen, Sicherheitssysteme).
Regeln definieren automatische Produktzuordnungen bei Bestellungen oder Anfragen.

{rules_context}

Der Benutzer moechte eine neue Regel erstellen. Analysiere die Anfrage und schlage eine strukturierte Regel vor.

Antworte auf Deutsch (Schweizer Hochdeutsch, kein ss statt ß). Gib zuerst eine kurze Erklaerung, dann schlage die Regel im JSON-Format vor.

Benutzeranfrage: {message}

Antwort im JSON-Format:
{{
  "reply": "Deine Erklaerung an den Benutzer",
  "suggested_rule": {{
    "name": "Kurzname der Regel",
    "beschreibung": "Was die Regel tut",
    "bedingung": "Wann die Regel greift (z.B. Produkt enthaelt 'Schluesselbox')",
    "aktion": "Was passiert (z.B. Schluesselhalter Flex hinzufuegen)"
  }}
}}

Falls der Benutzer keine konkrete Regel beschreibt sondern eine Frage stellt, antworte nur mit:
{{
  "reply": "Deine Antwort",
  "suggested_rule": null
}}
"""

        try:
            from src.api_client import APIClient
            api = APIClient(config)
            result = api.complete_json(prompt)
            return jsonify({
                "reply": result.get("reply", "Ich konnte die Anfrage nicht verarbeiten."),
                "suggested_rule": result.get("suggested_rule"),
            })
        except Exception as e:
            return jsonify({
                "reply": f"Fehler bei der Verarbeitung: {str(e)}",
                "suggested_rule": None,
            })

    # ---- INBOX DIRECTORY CONFIG ----

    @app.route("/api/config/inbox-dir")
    def api_inbox_dir():
        """Gibt das aktuelle Inbox-Verzeichnis zurück."""
        return jsonify({"inbox_dir": str(inbox_path)})

    @app.route("/api/config/inbox-dir", methods=["POST"])
    def api_inbox_dir_set():
        """Setzt ein neues Inbox-Verzeichnis."""
        data = request.get_json() or {}
        new_dir = data.get("inbox_dir", "").strip()
        if not new_dir:
            return jsonify({"error": "Kein Verzeichnis angegeben"}), 400
        new_path = Path(new_dir)
        if not new_path.exists():
            return jsonify({"error": f"Verzeichnis existiert nicht: {new_dir}"}), 400
        if not new_path.is_dir():
            return jsonify({"error": f"Kein Verzeichnis: {new_dir}"}), 400
        # Update config in memory
        config.setdefault("paths", {})["inbox"] = new_dir
        nonlocal inbox_path
        inbox_path = new_path
        return jsonify({"ok": True, "inbox_dir": str(new_path)})

    @app.route("/api/scan-inbox-dir", methods=["POST"])
    def api_scan_inbox_dir():
        """Scannt das Inbox-Verzeichnis und verarbeitet neue .eml-Dateien."""
        try:
            eml_files = list(inbox_path.glob("*.eml"))
            if not eml_files:
                return jsonify({"ok": True, "count": 0, "message": "Keine .eml-Dateien gefunden"})

            from src.processor import Processor
            processor = Processor(config)
            results = []
            for eml_file in eml_files:
                try:
                    result = processor.process_file(eml_file)
                    if result:
                        results.append(result)
                except Exception:
                    pass
            return jsonify({"ok": True, "count": len(results)})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ---- PROCESSING ----

    @app.route("/api/process", methods=["POST"])
    def api_process():
        """Verarbeitet alle E-Mails im Inbox."""
        try:
            from src.processor import Processor
            processor = Processor(config)
            results = processor.process_all()
            return jsonify({
                "ok": True,
                "count": len(results),
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/upload", methods=["POST"])
    def api_upload():
        """Nimmt hochgeladene .eml-Dateien entgegen und verarbeitet sie."""
        files = request.files.getlist("files")
        if not files:
            return jsonify({"error": "Keine Dateien hochgeladen"}), 400

        saved = []
        errors = []
        for f in files:
            name = secure_filename(f.filename or "upload.eml")
            if not name.lower().endswith(".eml"):
                errors.append(f"{name}: Nur .eml-Dateien erlaubt")
                continue
            dest = inbox_path / name
            counter = 1
            while dest.exists():
                stem = Path(name).stem
                dest = inbox_path / f"{stem}_{counter}.eml"
                counter += 1
            f.save(str(dest))
            saved.append(dest.name)

        if not saved:
            return jsonify({"error": "; ".join(errors)}), 400

        results = []
        try:
            from src.processor import Processor
            processor = Processor(config)
            for filename in saved:
                result = processor.process_file(inbox_path / filename)
                if result:
                    results.append(result)
        except Exception as e:
            return jsonify({"ok": True, "saved": saved, "warning": str(e)})

        return jsonify({"ok": True, "saved": saved, "processed": len(results), "errors": errors})

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="127.0.0.1", port=5000, debug=True)
