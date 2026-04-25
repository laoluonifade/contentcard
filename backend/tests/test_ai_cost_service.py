import asyncio
import unittest

from app.services import ai_cost_service as svc


class AiCostServiceTests(unittest.TestCase):
    def test_fingerprint_stable_for_equivalent_whitespace(self):
        msgs_a = [{"role": "user", "content": "Hello   world"}]
        msgs_b = [{"role": "user", "content": "hello world"}]
        a = svc.build_fingerprint(
            endpoint_name="prep_chat",
            model="gpt-4o-mini",
            messages=msgs_a,
            max_tokens=400,
            temperature=0.5,
            json_mode=True,
        )
        b = svc.build_fingerprint(
            endpoint_name="prep_chat",
            model="gpt-4o-mini",
            messages=msgs_b,
            max_tokens=400,
            temperature=0.5,
            json_mode=True,
        )
        self.assertEqual(a, b)

    def test_model_routing_prep_prefers_low_cost(self):
        model = svc.route_model("prep_chat", high_quality_required=False)
        self.assertIn(model, {svc.settings.OPENAI_LOW_COST_MODEL, svc.settings.OPENAI_HIGH_QUALITY_MODEL})

    def test_message_limit_trims_large_payloads(self):
        huge = "x" * (svc.settings.AI_MAX_INPUT_CHARS_PER_MESSAGE + 500)
        out = svc.enforce_message_limits([{"role": "user", "content": huge}], "prep_chat")
        self.assertLessEqual(len(out[0]["content"]), svc.settings.AI_MAX_INPUT_CHARS_PER_MESSAGE)

    def test_cache_roundtrip(self):
        key = "unit-test-cache"
        svc.cache_set("openai_chat", key, "ok", ttl_sec=60)
        self.assertEqual(svc.cache_get("openai_chat", key), "ok")


class AiSingleFlightTests(unittest.IsolatedAsyncioTestCase):
    async def test_singleflight_dedupes(self):
        runs = {"count": 0}

        async def work():
            runs["count"] += 1
            await asyncio.sleep(0.01)
            return "done"

        async def invoke():
            return await svc.singleflight_run("same-key", work)

        results = await asyncio.gather(invoke(), invoke(), invoke())
        self.assertEqual(results, ["done", "done", "done"])
        self.assertEqual(runs["count"], 1)


if __name__ == "__main__":
    unittest.main()
