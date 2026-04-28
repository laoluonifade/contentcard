Fixed regression scenarios for ContentCard generation quality.

Files:
- `manifest.json`: suite-level thresholds and scenario file list
- `*.scenario.json`: one brand/month request payload plus reference file
- `*.reference.json`: approved reference outputs for side-by-side judging
- optional `*.rendered.json`: exported rendered posts with `image_url` / `image_urls` for image checks

Run the suite:

```bash
python3 backend/scripts/evaluate_generation_quality.py \
  --scenario-dir backend/evals/scenarios \
  --repeat 3 \
  --output-file /tmp/contentcard-regression.json
```

Scenario shape:

```json
{
  "name": "d2c-launch-instagram",
  "reference_file": "d2c-launch-instagram.reference.json",
  "rendered_posts_file": "d2c-launch-instagram.rendered.json",
  "brand": {},
  "month": 6,
  "year": 2026,
  "platforms": ["instagram"],
  "format_mix": "mixed",
  "posts_per_week": 3,
  "topic_override": null,
  "template_topics": [],
  "holiday_context": null,
  "generation_brief": "optional free-text notes",
  "campaign_brief": {},
  "thresholds": {
    "min_avg_score_a": 75,
    "min_wins": 2,
    "require_image_checks": true,
    "min_image_avg_score": 0.7
  }
}
```
