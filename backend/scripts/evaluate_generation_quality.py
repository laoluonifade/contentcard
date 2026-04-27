"""
Regression harness for ContentCard generation quality.

Supports:
1. Single scenario comparison against a reference file
2. Fixed scenario suites with repeat runs and release thresholds
3. Optional rendered-image checks when a scenario includes exported image URLs
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import statistics
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


DEFAULT_THRESHOLDS = {
    "min_avg_score_a": 72.0,
    "min_wins": 1,
    "max_generic_caption_warnings": 0,
    "max_shallow_visual_warnings": 0,
    "max_short_prompt_warnings": 0,
    "min_image_avg_score": 0.66,
    "require_image_checks": False,
}


def _load_json(path: str | Path) -> dict | list:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _extract_posts(payload: dict | list) -> list[dict]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict) and isinstance(payload.get("posts"), list):
        return [row for row in payload["posts"] if isinstance(row, dict)]
    raise ValueError("Payload must be a list of posts or an object with a 'posts' array")


def _scenario_name(path: Path, payload: dict) -> str:
    return str(payload.get("name") or path.stem)


def _warning_counts(posts: list[dict]) -> dict[str, int]:
    counts = {
        "generic_caption_language": 0,
        "shallow_visual_direction": 0,
        "short_image_prompt": 0,
        "forbidden_words_present": 0,
        "weak_carousel_depth": 0,
    }
    for post in posts:
        for warning in post.get("quality_warnings") or []:
            key = str(warning or "").strip()
            if key in counts:
                counts[key] += 1
    return counts


async def _judge_outputs(candidate_posts: list[dict], reference_posts: list[dict], brief: dict | None) -> dict:
    from app.services.ai_service import _openai_chat

    prompt = f"""You are evaluating social media post quality side by side.

Compare Candidate A (ContentCard output) against Candidate B (reference output).
Judge for:
- brand specificity
- caption excitement and hook strength
- commercial usefulness
- CTA clarity
- visual-direction specificity
- overall ready-to-post quality

Return ONLY valid JSON with this shape:
{{
  "winner": "A" or "B" or "tie",
  "score_a": 0-100,
  "score_b": 0-100,
  "dimension_scores": {{
    "brand_specificity": {{"A": 0-10, "B": 0-10}},
    "caption_strength": {{"A": 0-10, "B": 0-10}},
    "commercial_usefulness": {{"A": 0-10, "B": 0-10}},
    "cta_clarity": {{"A": 0-10, "B": 0-10}},
    "visual_specificity": {{"A": 0-10, "B": 0-10}}
  }},
  "summary": "2-4 sentence summary",
  "strengths_a": ["short point"],
  "strengths_b": ["short point"],
  "fixes_for_a": ["short point"]
}}

Structured brief:
{json.dumps(brief or {}, ensure_ascii=False)[:4000]}

Candidate A:
{json.dumps(candidate_posts, ensure_ascii=False)[:30000]}

Candidate B:
{json.dumps(reference_posts, ensure_ascii=False)[:30000]}
"""
    raw = await _openai_chat(
        [{"role": "user", "content": prompt}],
        max_tokens=3000,
        temperature=0.2,
        json_mode=True,
        endpoint_name="monthly_generation_plan",
        high_quality_required=True,
    )
    return json.loads(raw)


async def _score_rendered_images(rendered_posts: list[dict], brand: dict) -> dict:
    from app.services.quality_gate_service import score_visual_quality

    slide_scores: list[float] = []
    scored_images = 0
    for post in rendered_posts:
        urls = []
        if isinstance(post.get("image_urls"), list):
            urls.extend([str(url).strip() for url in post["image_urls"] if str(url).strip()])
        if post.get("image_url"):
            urls.append(str(post.get("image_url")).strip())
        deduped = list(dict.fromkeys(urls))
        for url in deduped:
            qg = await score_visual_quality(url, brand, post, lint=None, min_score=DEFAULT_THRESHOLDS["min_image_avg_score"])
            if str(qg.get("status") or "") == "skip":
                continue
            scored_images += 1
            slide_scores.append(float(qg.get("overall_score") or 0.0))
    return {
        "scored_images": scored_images,
        "average_score": round(sum(slide_scores) / len(slide_scores), 3) if slide_scores else None,
        "min_score": round(min(slide_scores), 3) if slide_scores else None,
    }


async def _run_single_generation(payload: dict) -> list[dict]:
    from app.services.ai_service import generate_monthly_plan

    return await generate_monthly_plan(
        brand=payload["brand"],
        month=int(payload["month"]),
        year=int(payload["year"]),
        platforms=[str(p).lower() for p in payload["platforms"]],
        format_mix=str(payload.get("format_mix") or "mixed"),
        posts_per_week=int(payload.get("posts_per_week") or 3),
        topic_override=payload.get("topic_override"),
        template_topics=payload.get("template_topics"),
        holiday_context=payload.get("holiday_context"),
        generation_brief=payload.get("generation_brief"),
        campaign_brief=payload.get("campaign_brief"),
    )


async def run_eval(input_file: str, reference_file: str, output_file: str | None, repeat: int = 1) -> dict:
    payload = _load_json(input_file)
    if not isinstance(payload, dict):
        raise ValueError("Input file must be a JSON object")
    reference_payload = _load_json(reference_file)
    reference_posts = _extract_posts(reference_payload)

    runs = []
    for idx in range(max(1, repeat)):
        candidate_posts = await _run_single_generation(payload)
        judgment = await _judge_outputs(candidate_posts, reference_posts, payload.get("campaign_brief"))
        runs.append({
            "run_index": idx + 1,
            "candidate_posts": candidate_posts,
            "judgment": judgment,
            "warning_counts": _warning_counts(candidate_posts),
        })

    result = {
        "input_file": input_file,
        "reference_file": reference_file,
        "repeat": max(1, repeat),
        "runs": runs,
    }

    if output_file:
        out_path = Path(output_file)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        logger.info("Saved evaluation result to %s", out_path)

    return result


def _resolve_reference_path(base_dir: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (base_dir / path).resolve()


async def run_suite(scenario_dir: str, output_file: str | None, repeat: int = 3) -> dict:
    scenario_root = Path(scenario_dir).resolve()
    manifest_path = scenario_root / "manifest.json"
    if manifest_path.exists():
        manifest = _load_json(manifest_path)
        scenario_files = [
            _resolve_reference_path(scenario_root, row["scenario_file"])
            for row in (manifest.get("scenarios") or [])
            if isinstance(row, dict) and row.get("scenario_file")
        ]
        base_thresholds = {**DEFAULT_THRESHOLDS, **(manifest.get("thresholds") or {})}
    else:
        scenario_files = sorted(scenario_root.glob("*.scenario.json"))
        base_thresholds = dict(DEFAULT_THRESHOLDS)

    scenario_results = []
    for scenario_path in scenario_files:
        payload = _load_json(scenario_path)
        if not isinstance(payload, dict):
            raise ValueError(f"Scenario must be a JSON object: {scenario_path}")
        name = _scenario_name(scenario_path, payload)
        reference_path = _resolve_reference_path(scenario_path.parent, str(payload["reference_file"]))
        reference_posts = _extract_posts(_load_json(reference_path))
        thresholds = {**base_thresholds, **(payload.get("thresholds") or {})}
        rendered_path = None
        if payload.get("rendered_posts_file"):
            rendered_path = _resolve_reference_path(scenario_path.parent, str(payload["rendered_posts_file"]))

        runs = []
        for idx in range(max(1, repeat)):
            candidate_posts = await _run_single_generation(payload)
            judgment = await _judge_outputs(candidate_posts, reference_posts, payload.get("campaign_brief"))
            run_data = {
                "run_index": idx + 1,
                "candidate_posts": candidate_posts,
                "judgment": judgment,
                "warning_counts": _warning_counts(candidate_posts),
            }
            if rendered_path and rendered_path.exists():
                rendered_posts = _extract_posts(_load_json(rendered_path))
                run_data["image_checks"] = await _score_rendered_images(rendered_posts, payload["brand"])
            runs.append(run_data)

        wins = sum(1 for run in runs if str(run["judgment"].get("winner")) == "A")
        avg_score_a = statistics.mean(float(run["judgment"].get("score_a") or 0.0) for run in runs)
        generic_warnings = sum(int(run["warning_counts"]["generic_caption_language"]) for run in runs)
        shallow_visual_warnings = sum(int(run["warning_counts"]["shallow_visual_direction"]) for run in runs)
        short_prompt_warnings = sum(int(run["warning_counts"]["short_image_prompt"]) for run in runs)
        image_scores = [run.get("image_checks", {}).get("average_score") for run in runs if run.get("image_checks", {}).get("average_score") is not None]

        passed = (
            avg_score_a >= float(thresholds["min_avg_score_a"])
            and wins >= int(thresholds["min_wins"])
            and generic_warnings <= int(thresholds["max_generic_caption_warnings"])
            and shallow_visual_warnings <= int(thresholds["max_shallow_visual_warnings"])
            and short_prompt_warnings <= int(thresholds["max_short_prompt_warnings"])
            and (
                not thresholds.get("require_image_checks")
                or (image_scores and statistics.mean(image_scores) >= float(thresholds["min_image_avg_score"]))
            )
        )

        scenario_results.append({
            "name": name,
            "scenario_file": str(scenario_path),
            "reference_file": str(reference_path),
            "thresholds": thresholds,
            "summary": {
                "passed": passed,
                "wins": wins,
                "avg_score_a": round(avg_score_a, 2),
                "generic_caption_warnings": generic_warnings,
                "shallow_visual_warnings": shallow_visual_warnings,
                "short_image_prompt_warnings": short_prompt_warnings,
                "avg_image_score": round(statistics.mean(image_scores), 3) if image_scores else None,
            },
            "runs": runs,
        })

    overall = {
        "scenario_count": len(scenario_results),
        "passed_count": sum(1 for row in scenario_results if row["summary"]["passed"]),
        "failed_scenarios": [row["name"] for row in scenario_results if not row["summary"]["passed"]],
    }
    result = {
        "scenario_dir": str(scenario_root),
        "repeat": max(1, repeat),
        "thresholds": base_thresholds,
        "overall": overall,
        "scenarios": scenario_results,
    }

    if output_file:
        out_path = Path(output_file)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        logger.info("Saved suite result to %s", out_path)

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-file", help="JSON file describing one generation request")
    parser.add_argument("--reference-file", help="JSON file containing reference posts for single-scenario mode")
    parser.add_argument("--scenario-dir", help="Directory containing fixed regression scenarios")
    parser.add_argument("--output-file", default=None, help="Optional JSON file to save the evaluation result")
    parser.add_argument("--repeat", type=int, default=1, help="Repeat count for the same scenario or suite")
    args = parser.parse_args()

    if args.scenario_dir:
        result = asyncio.run(run_suite(args.scenario_dir, args.output_file, repeat=args.repeat))
        if result["overall"]["failed_scenarios"]:
            logger.error("Regression suite failed: %s", ", ".join(result["overall"]["failed_scenarios"]))
            raise SystemExit(1)
    else:
        if not args.input_file or not args.reference_file:
            raise SystemExit("--input-file and --reference-file are required unless --scenario-dir is used")
        asyncio.run(run_eval(args.input_file, args.reference_file, args.output_file, repeat=args.repeat))
