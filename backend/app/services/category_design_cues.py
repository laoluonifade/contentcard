"""
Per-category design cues — parent + sub-category aware.

ContentCard already has business-shape defaults (`BUSINESS_SHAPE_DEFAULTS` in
ai_service.py) that bias content_type / format / template-family. Those decide
"what kind of post this is". This module decides "how a post for THIS kind of
business should look + read" — short qualitative cues a designer would brief.

Two layers:

  CATEGORY_DESIGN_CUES   — keyed by parent category (e.g. "Food Store").
                            Always has a value for every supported parent.

  SUBCATEGORY_DESIGN_CUES — keyed by sub-category (e.g. "Restaurant",
                            "Streetwear brand", "Skincare brand"). Optional;
                            sub-categories without an entry inherit purely
                            from the parent.

Resolved cues are the parent block with the sub-category block deep-merged on
top, so a sub-cat can override any single field while inheriting the rest.
The caller passes (parent_category, sub_category) — both optional — and gets
back a single dict.

Fields per entry (all strings, all optional):

  focus            — strategic priorities the AI anchors the post around
                     (a menu of 8-10 angles to pick 1-3 from per post).
  layout_emphasis  — what the composition leads with.
  visual_focus     — what the eye lands on first (concrete visual cues
                     the AI can pick from).
  color_mood       — emotional palette temperature (brand colours still win).
  text_options     — on-design headline snippets the AI can pick from.
  text_balance     — how much text on the design + caption balance.
  imagery_style    — what kind of photography / illustration fits.
  tone_hint        — voice nudge for caption + on-image text (a list of
                     tonal attributes the AI can lean into).
  content_types    — example post angles that suit this sub-category.

`cues_as_text()` renders any subset of these fields into the strategist /
text-gen prompts. Lookups are case + whitespace insensitive on both keys.
"""

from __future__ import annotations


CategoryCues = dict[str, str]


# Parent categories match frontend/src/lib/industryTaxonomy.js.
CATEGORY_DESIGN_CUES: dict[str, CategoryCues] = {
    "Fashion Store": {
        "focus":           "Style, identity, fit, quality, self-expression, drops, occasions, confidence, aspiration, wardrobe value.",
        "layout_emphasis": "Editorial poster. Lead with one outfit / garment / pair on a clean backdrop. Spacious composition; let silhouette and fabric texture carry the frame.",
        "visual_focus":    "The product itself, sharp and uncropped. Models when they help (showing fit or fabric movement) — always real, never plastic-AI / stock.",
        "color_mood":      "Either honour the brand palette dramatically (saturated brand block) or go restrained editorial (warm neutral, cream, charcoal). The product carries the colour story.",
        "text_options":    "'New In', 'New Drop', 'Now Available', 'Out Now', 'Fresh Arrival', 'Your Next Look', 'Style Upgrade', 'Limited Run'.",
        "text_balance":    "One bold headline with a specific noun (the garment, the drop, the silhouette). Price + CTA always present but small — the visual sells.",
        "imagery_style":   "Real product or lookbook photography. Avoid 3D renders, plastic AI faces, and stock 'fashion' clichés.",
    },
    "Beauty / Skincare Store": {
        "focus":           "Results, transformation, beauty, confidence, ingredients, routine, trust, self-care, identity, glow.",
        "layout_emphasis": "Product-as-hero with breathing space. A single bottle, pan, or stick on a clean surface in soft natural light, or a close-up of the texture.",
        "visual_focus":    "The product or its texture (cream swatch, pigment swatch, lather, fragrance bottle catching light). Skin / hair / face shots when they show the result.",
        "color_mood":      "Soft, expensive-looking. Pair the brand colour with cream / nude / oat / blush / sage. Avoid neon saturation unless the brand is explicitly bold.",
        "text_options":    "'Glow Starts Here', 'Your Daily Ritual', 'Made for You', 'New Arrival', 'Now Available', 'Beauty Made Simple', 'Wear Confidence', 'Start Today'.",
        "text_balance":    "Promise the outcome ('Plump skin in 14 days', 'Glow that lasts'). Headline tight + specific; supporting copy mentions a key ingredient or claim.",
        "imagery_style":   "Real product photography with crisp specular highlights. Diverse, real skin / hair when models appear. Avoid 'wellness' cucumber-slice stock.",
    },
    "Food Store": {
        "focus":           "Hunger, freshness, taste, convenience, cravings, value, occasions, repeat orders, indulgence, locality.",
        "layout_emphasis": "Appetite-first. Hero plate or close-up of the dish, full-bleed composition with generous breathing space.",
        "visual_focus":    "The food itself with sensory cues — steam, sauce drip, ice condensation, hands reaching, a fork lifting a bite. The product is the headline.",
        "color_mood":      "Warm, saturated, mouthwatering. Honour the brand colour but lean into the natural colours of the food. Lighting flatters texture.",
        "text_options":    "'Hot & Fresh', 'Order Now', 'Today's Special', 'Freshly Made', 'Try This Today', 'Made Hot', 'Bring Your Appetite', 'Available Now'.",
        "text_balance":    "Short and craveable. Headline names the dish, the bundle, or the offer. Price + ordering CTA close to the headline. No paragraphs.",
        "imagery_style":   "Real food photography with natural light. Avoid plastic AI food and overly-composed studio plates.",
    },
    "Electronics / Gadgets Store": {
        "focus":           "Performance, value, speed, reliability, daily use, upgrade, specs, features, status, problem-solving.",
        "layout_emphasis": "Spec-led product hero. The device on a clean surface or floating in clean negative space. Emphasise materials (matte, metal, glass) and edges.",
        "visual_focus":    "The product itself — hero shots, exploded views, side-by-side comparisons. UI on screen when the product has one.",
        "color_mood":      "Cool and crisp. Brand accent on a calm neutral background (charcoal, off-white, soft graphite). Saturated only on highlights / actions.",
        "text_options":    "'Upgrade Now', 'New Arrival', 'Built for Speed', 'Power in Your Hand', 'Now Available', 'Smarter Tech', 'Stay Connected', 'Your Next Upgrade'.",
        "text_balance":    "Concrete claims with units (battery hrs, RAM, screen size, price). Headline names the spec advantage; supporting line gives one number.",
        "imagery_style":   "Photoreal product shots. Avoid generic 'tech' stock photography of laptops on wooden desks.",
    },
    "Home & Lifestyle Store": {
        "focus":           "Aesthetics, comfort, ambience, room transformation, quality, taste, self-expression, lifestyle, mood, durability.",
        "layout_emphasis": "Magazine-clean. Either a hero product on a styled surface or a wide shot of the styled scene the product fits into.",
        "visual_focus":    "The product in its natural context (the chair in the room, linens on the bed, the lamp lighting a corner). Real spaces, not stock interiors.",
        "color_mood":      "Warm neutrals (oat, cream, terracotta, soft sage) plus the brand accent. Light is intentional and directional, never harsh.",
        "text_options":    "'Style Your Space', 'Room Refresh', 'Make It Yours', 'Now Available', 'New Arrival', 'Bring Comfort Home', 'Your Space, Elevated', 'Designed for Living'.",
        "text_balance":    "Considered, evocative. Headline plants the feeling ('Sundays start here'); supporting copy gives one practical detail (size, finish, price).",
        "imagery_style":   "Real interior photography or a controlled studio still-life. Avoid 3D-rendered rooms and CGI furniture.",
    },
    "Health & Wellness Store": {
        "focus":           "Wellness, results, energy, routine, balance, trust, daily action, support, self-care, body confidence.",
        "layout_emphasis": "Calm and clean. Product close-up with breathing space, or a real person mid-routine.",
        "visual_focus":    "The product or the routine moment. Real bodies, real hands, real breath; the supplement bottle, the resistance band, the wellness drink.",
        "color_mood":      "Soft and earthy — sage, oat, muted terracotta. The brand accent stays calm, never neon. Natural light flatters skin.",
        "text_options":    "'Daily Wellness', 'Feel Better Daily', 'Support Your Routine', 'Start Today', 'Your Daily Boost', 'Made for You', 'Health Made Simple', 'Now Available'.",
        "text_balance":    "Promise the benefit, not the science. Single-claim headline; supporting line gives one specific (timeframe, ingredient, dose).",
        "imagery_style":   "Diverse real people in real spaces. Avoid 'wellness' stock with white robes and zen rocks.",
    },
    "Digital Products Store": {
        "focus":           "Outcome, transformation, skill, productivity, time-saved, convenience, expertise, growth, accessibility, value.",
        "layout_emphasis": "Type-led hero. Big claim plus a single artefact (a screen, a chapter cover, a lesson card, a template thumbnail). Spacious and grid-aligned.",
        "visual_focus":    "The artefact (course preview, ebook cover, template thumbnail, app screen). When people appear, they're real users — never stock.",
        "color_mood":      "Confident and modern. Brand accent on calm neutrals; saturated only on the CTA. Avoid generic 'tech' gradients.",
        "text_options":    "'Start Today', 'Learn Faster', 'Work Smarter', 'Save Time', 'Your Next Level', 'Download Now', 'Get Instant Access', 'Built for Outcomes'.",
        "text_balance":    "Bold headline with the outcome ('Land your first 5 clients'); supporting line gives one piece of proof or scope. CTAs sound like 'Start free', 'Download', 'Enrol now'.",
        "imagery_style":   "Photoreal screenshots, clean illustrations, or a single artefact photographed cleanly. Avoid generic 'computer' stock.",
    },
    "Multi-product Store (General Store)": {
        "focus":           "Variety, discovery, value, convenience, bundles, curation, deals, repeat visits, availability, broad appeal.",
        "layout_emphasis": "Versatile and editorial. Lead with a curated grid of products or a single hero rotated by category. Unifying treatment matters more than any one shot.",
        "visual_focus":    "The selection — multiple products composed together (collage / set / 'today's picks') — or a single hero with the rest as supporting marks.",
        "color_mood":      "Brand-led with a flexible accent. Backgrounds drawn from the brand kit, never busy or cluttered.",
        "text_options":    "'Top Picks', 'New Arrivals', 'Best Deals', 'This Week's Picks', 'Bundle & Save', 'Available Now', 'Fresh Finds', 'Shop the Edit'.",
        "text_balance":    "Concise and curatorial. Headline names the moment ('Today's drop', 'Weekend essentials'); supporting copy lists 2-3 product names or a price band.",
        "imagery_style":   "Real product photography composed cleanly. Avoid mismatched scales or jarring background swaps between items.",
    },
}


# ── Sub-category overrides ──────────────────────────────────────────────────
#
# Sub-categories sharpen the parent. They override (not replace) — any field
# the sub-cat doesn't set is inherited from the parent block above. Names
# match `INDUSTRY_TAXONOMY[parent]` in frontend/src/lib/industryTaxonomy.js
# exactly so a brand's stored sub_industry maps without normalisation.
SUBCATEGORY_DESIGN_CUES: dict[str, CategoryCues] = {
    # ── Food Store ──
    "Restaurant": {
        "layout_emphasis": "Image-heavy with minimal overlays. Let the food fill the frame; type is a tag, not the headline.",
        "visual_focus":    "Close-up food shots with sensory cues — steam rising, sauce drip, melted cheese pull, ice condensation. The dish triggers cravings on its own.",
        "text_balance":    "VERY short on the design (1-5 words max): 'Hot & Fresh', 'Try this today'. The caption carries detail, hours, and the order link.",
        "tone_hint":       "Urgent, simple, appetizing. 'Hot now', 'Today only', 'Order in 2 taps'.",
        "content_types":   "Today's special, daily menu, combos, 'what are you eating tonight?', behind-the-counter, weekend bundles.",
    },
    "Cloud kitchen": {
        "layout_emphasis": "Clean food shot on top, packaging or delivery cue underneath. Reads as 'order → arrives hot'.",
        "visual_focus":    "The dish + the packaging that lands at the customer's door. A single small UI cue (order button, delivery time) where it helps.",
        "text_balance":    "Short with a clear CTA: 'Order now', 'Delivered hot', 'Tap to order'. Caption carries hours + link.",
        "tone_hint":       "Fast, practical, no fluff. Convenience is the value.",
        "content_types":   "Delivery-focused dishes, fast meals, lunch / dinner bundles, time-window promos ('Lunch in 25 min').",
    },
    "Bakery / desserts": {
        "layout_emphasis": "Centered product. Soft glossy lighting; let the indulgence speak.",
        "visual_focus":    "Glossy close-ups — frosting, crumb, drip, dust. Hands reaching; bite-cross-sections welcome.",
        "text_balance":    "Minimal: 'Freshly baked', 'Sweet treats', 'New flavour'. The product does the selling.",
        "tone_hint":       "Warm, emotional, indulgent. 'Treat yourself', 'For the ones you love'.",
        "content_types":   "Product highlights, occasion bakes (birthdays, weddings, holidays), seasonal flavours, behind-the-counter craft.",
    },
    "Packaged food brand": {
        "layout_emphasis": "Structured + clean. Product + lifestyle context (in a kitchen, on a desk, in a hand). Grid-friendly.",
        "visual_focus":    "The packaged product front-of-frame plus a real-world moment of use.",
        "text_balance":    "Short + brand-driven: 'Taste the crunch', 'Made for snack o'clock'. Caption carries claims and stockists.",
        "tone_hint":       "Polished and consistent. Repeatable voice across every post — the brand IS the trust signal.",
        "content_types":   "Brand storytelling, product benefits, recipe ideas using the product, customer reactions, retail availability.",
    },
    "Drinks / smoothies / juice": {
        "layout_emphasis": "Dynamic. Splashes, pours, motion-frozen drips — the drink in action.",
        "visual_focus":    "The drink itself with vibrant motion — pour, splash, ice clink, condensation on glass.",
        "color_mood":      "Saturated and vibrant — fruit colours, ice blue, citrus yellow. Brand accent supports.",
        "text_balance":    "Very short: 'Stay fresh', 'Cold pressed', 'Sip happy'.",
        "tone_hint":       "Energetic, playful, refreshing.",
        "content_types":   "Flavour drops, pour shots, fitness tie-ins, breakfast / desk-side moments.",
    },
    "Grocery / food retail": {
        "layout_emphasis": "Grid or bundle layout — multiple products composed together as one offer.",
        "visual_focus":    "Multiple products in one frame; the selection is the story.",
        "text_balance":    "Medium: 'Weekend deals', 'Stock up for the week', '3 for ₦5,000'. Lists are OK.",
        "tone_hint":       "Practical and value-driven. Speak to weekly shoppers.",
        "content_types":   "Weekly deals, seasonal produce, recipe-ready bundles, restock alerts, multi-buy offers.",
    },

    # ── Fashion Store ──
    "Streetwear brand": {
        "layout_emphasis": "Editorial. Cropped portraits, urban backgrounds, UGC-style mixed in.",
        "visual_focus":    "Models in real urban context — street, stairs, garage, rooftop. Garment + culture together.",
        "text_balance":    "Minimal: 'New drop', 'Out now', 'Locked in'. Caption carries the drop time + link.",
        "tone_hint":       "Bold, confident, culture-aware. Speaks to the community, not at it.",
        "content_types":   "New drops, collab teasers, fit pics, street snaps, restocks, behind-the-design.",
    },
    "Women's fashion": {
        "layout_emphasis": "Clean and airy. Single styled outfit on a calm backdrop or in a lifestyle moment.",
        "visual_focus":    "Styled outfits, full-body or three-quarter, with attention to silhouette and styling notes.",
        "text_balance":    "Short and aspirational: 'Made for Sundays', 'New season ready'.",
        "tone_hint":       "Aspirational, warm, inclusive — never patronising.",
        "content_types":   "Outfit drops, style guides, occasion looks, customer-on-real-bodies, capsule edits.",
    },
    "Men's fashion": {
        "layout_emphasis": "Clean fits, controlled composition. Confident hero shots.",
        "visual_focus":    "The full fit on a real model in a calm setting. Silhouette and fabric come first.",
        "text_balance":    "Minimal and direct: 'Built for the week', 'Everyday tailored'.",
        "tone_hint":       "Direct, no-fuss, quietly confident.",
        "content_types":   "Outfit guides, capsule essentials, tailoring close-ups, weekend vs work fits.",
    },
    "Luxury fashion": {
        "layout_emphasis": "Restrained, exclusive. Generous negative space; one element in the frame.",
        "visual_focus":    "A single garment, accessory, or detail shot. High-end light. Talent appears sparingly and only when iconic.",
        "color_mood":      "Restrained editorial — bone, ivory, charcoal, deep brand jewel tone. Never bright sale-block colours.",
        "text_balance":    "VERY minimal — sometimes just the brand mark and a date.",
        "tone_hint":       "Refined, understated, never desperate. Confident by absence.",
        "content_types":   "Capsule unveilings, atelier glimpses, archival reissues, single-product features, by-appointment cues.",
    },
    "Activewear / fitness wear": {
        "layout_emphasis": "Motion-led. Mid-action shots in real training context.",
        "visual_focus":    "Body in motion — running, lifting, stretching. Garment moves and breathes with the wearer.",
        "text_balance":    "Short and direct: 'Built to move', 'Train hot'. Caption carries fabric / fit detail.",
        "tone_hint":       "Energetic, capable, real. Never plastic 'fitness' stock.",
        "content_types":   "Drops tied to training moments, athlete features, fabric tech, recovery pieces.",
    },
    "Thrift / resale": {
        "layout_emphasis": "Editorial flatlay or single-piece spotlight. Each piece is one-of-one — treat it that way.",
        "visual_focus":    "The unique piece on a clean backdrop, with size and condition called out as part of the design.",
        "text_balance":    "Short with the size + price: 'Size M · ₦12,000 · 1 left'. Scarcity is the urgency.",
        "tone_hint":       "Honest, witty, community-first. Real people, real finds.",
        "content_types":   "Daily drops, last-of-the-stock alerts, styling old pieces, restock teases, customer-restyle features.",
    },
    "Accessories (bags, jewelry)": {
        "layout_emphasis": "Close-up macro detail. The frame is mostly material and craft.",
        "visual_focus":    "The accessory itself in extreme detail — clasp, chain, leather grain, stone facet.",
        "text_balance":    "Short with one specific noun ('the gold loop', 'the handwoven strap').",
        "tone_hint":       "Premium, considered, tactile.",
        "content_types":   "Material close-ups, single-piece spotlights, on-body styling, gift-ready edits.",
    },
    "Footwear": {
        "layout_emphasis": "Strong angle product hero. The shoe at 3/4 view or laid against a contrast wall.",
        "visual_focus":    "The shoe itself — hero shot or in-foot motion. Texture, sole, stitching.",
        "text_balance":    "Minimal — model name + colour: 'Vela · Burnt sand'.",
        "tone_hint":       "Confident, clean, wearable.",
        "content_types":   "Drops, on-foot shots, restock alerts, colourway features.",
    },

    # ── Beauty / Skincare ──
    "Skincare brand": {
        "layout_emphasis": "Product close-up or skin close-up. Breathing space; everything else is calm.",
        "visual_focus":    "Skin texture (poreless, dewy, hydrated) or the product in soft hand-light. Real diverse skin types.",
        "text_balance":    "Medium: 'Clear skin routine', 'Plump in 14 days', 'Glow that lasts'.",
        "tone_hint":       "Educational + warm. Promises the outcome without overclaiming.",
        "content_types":   "Routine breakdowns, before/after, ingredient close-ups, skin-type recommendations, restock alerts.",
    },
    "Makeup brand": {
        "layout_emphasis": "Before/after split or lip/eye close-up. Bold colour leads.",
        "visual_focus":    "Pigment swatches, lip texture, eye work, transformation. Real models, diverse skin tones.",
        "text_balance":    "Short and expressive: 'Bold lips', 'Long-wear matte', 'Glide on'.",
        "tone_hint":       "Expressive, playful, confident.",
        "content_types":   "Shade drops, before/after, tutorial moments, artist features, restock alerts.",
    },
    "Hair products / wigs": {
        "layout_emphasis": "Model-led. Full hair in motion or styled close-up.",
        "visual_focus":    "Real hair on real models — shine, length, curl pattern, colour.",
        "text_balance":    "Short: 'Body wave 22\"', 'Locked in for weeks', 'Style ready'.",
        "tone_hint":       "Confident, polished, body-positive.",
        "content_types":   "Style drops, density / length features, install guides, customer-wear stories.",
    },
    "Organic / natural beauty": {
        "layout_emphasis": "Earthy, soft, natural. Product on linen / wood / stone with botanical props.",
        "visual_focus":    "The product in nature-adjacent context — leaves, soil, water, raw ingredient.",
        "color_mood":      "Earth tones — moss, oat, terracotta, clay. Brand accent kept calm.",
        "text_balance":    "Medium: 'Made from real botanicals', 'Clean enough to eat'.",
        "tone_hint":       "Soft, honest, gentle. Lean on real ingredients, not vague 'clean' claims.",
        "content_types":   "Ingredient stories, sourcing notes, seasonal blends, customer rituals.",
    },
    "Fragrance / perfumes": {
        "layout_emphasis": "Cinematic, mood-led. The bottle in light + a single emotional cue.",
        "visual_focus":    "The bottle catching light, smoke, fabric, water — sensory abstractions of the scent.",
        "text_balance":    "Very minimal — sometimes just the scent name.",
        "tone_hint":       "Sensual, evocative, restrained.",
        "content_types":   "Scent stories, note breakdowns, mood films, gift edits.",
    },

    # ── Electronics / Gadgets ──
    "Mobile phones": {
        "focus":           "Performance, camera, battery, upgrade, speed, status, features, value, reliability, daily use.",
        "layout_emphasis": "Clean product hero. Device floating or on a calm surface.",
        "visual_focus":    "Phone hero shots, hands using device, clean tech backgrounds, close-up camera lens, screen UI, comparison layouts, lifestyle use, product angle shots, neon or minimal lighting, premium reflections.",
        "text_options":    "'Upgrade Now', 'Built for Speed', 'All-Day Battery', 'Sharp Camera', 'Next-Level Phone', 'Stay Connected', 'Power in Your Hand', 'Capture More', 'Smooth Performance', 'New Arrival'.",
        "text_balance":    "Short with a spec ('120Hz · all day', '5000mAh · 24hr'). Pick one phrase from text_options or name the spec advantage.",
        "tone_hint":       "Smart, direct, practical, tech-aware, confident, clean, modern, benefit-led, informative, sales-focused.",
        "content_types":   "Feature highlight, phone comparison, new stock, price deal, camera demo, battery benefit, unboxing, customer review, upgrade guide, specs simplified.",
    },
    "Accessories (chargers, cases)": {
        "focus":           "Utility, compatibility, convenience, protection, affordability, everyday use, durability, add-on purchase, problem-solving, value.",
        "layout_emphasis": "Use-case led. The accessory in real use (on a desk, in a bag, in hand).",
        "visual_focus":    "Chargers, cables, cases, earbuds in use, desk setups, product close-ups, clean flat lays, hands interacting, before-and-after protection, simple backgrounds, bundle visuals.",
        "text_options":    "'Protect Your Phone', 'Charge Faster', 'Everyday Essentials', 'Stay Powered', 'Better Sound', 'Case Up', 'Small Upgrade', 'Built to Last', 'Must-Have Add-on', 'Grab Yours'.",
        "text_balance":    "Short and practical ('Fast charge · 65W', 'Fits 14-pro'). Pick one phrase from text_options.",
        "tone_hint":       "Practical, clear, helpful, direct, affordable, reliable, simple, functional, confident, everyday.",
        "content_types":   "Product benefit, bundle offer, compatibility guide, problem-solution post, price promo, new arrival, top accessories, usage demo, customer review, gift guide.",
    },
    "Computers / laptops": {
        "focus":           "Productivity, performance, work, school, gaming-or-business use, reliability, specs, upgrade, value, durability.",
        "layout_emphasis": "Product hero with materials emphasis (matte / brushed / glass).",
        "visual_focus":    "Laptops on desks, work setups, student scenes, office environments, close-up keyboards, screen mockups, clean product shots, comparison tables, minimalist tech layouts, hands working.",
        "text_options":    "'Work Faster', 'Built for Productivity', 'Power Your Work', 'Laptop Upgrade', 'Study Ready', 'Business Ready', 'Fast Performance', 'Your Work Machine', 'New Stock', 'Get More Done'.",
        "text_balance":    "Spec-driven ('M-class chip · 18hr battery'). Pick one phrase from text_options or name the spec.",
        "tone_hint":       "Informative, practical, professional, clear, trusted, slightly technical, benefit-led, stable, confident, solution-driven.",
        "content_types":   "Feature breakdown, buyer guide, use case, price offer, student laptop picks, business laptop picks, comparison post, new stock, productivity tips, warranty / trust post.",
    },
    "Gaming": {
        "focus":           "Performance, excitement, speed, immersive experience, graphics, competition, setup goals, fun, community, upgrades.",
        "layout_emphasis": "Bold, dynamic. Strong angles + neon accents.",
        "visual_focus":    "RGB lighting, consoles, controllers, gaming desks, dark neon backgrounds, motion graphics, action scenes, headset shots, gamer hands, dynamic product angles.",
        "color_mood":      "Saturated neons (cyan, magenta, electric green) on dark backdrops. Brand accent leads.",
        "text_options":    "'Level Up', 'Game Faster', 'Built to Win', 'Play Harder', 'Upgrade Your Setup', 'No Lag', 'Next Match Ready', 'Power Your Game', 'Gear Up', 'Win More'.",
        "text_balance":    "Bold and short. Pick one phrase from text_options; let the RGB and angle do the rest.",
        "tone_hint":       "Energetic, bold, competitive, exciting, youthful, hype-driven, direct, fun, techy, confident.",
        "content_types":   "Setup inspiration, product drop, gaming accessory highlight, console sale, performance feature, comparison, gamer UGC, bundle offer, tournament-style post, new arrival.",
    },
    "Smart devices": {
        "focus":           "Convenience, modern living, automation, lifestyle improvement, ease, security, innovation, comfort, connected home, usefulness.",
        "layout_emphasis": "Lifestyle-in-home. Product set in a real room doing its job.",
        "visual_focus":    "Smart devices in homes, clean living spaces, hands using app controls, device close-ups, lifestyle scenes, modern interiors, soft lighting, minimal UI cues, family convenience, product in action.",
        "text_options":    "'Smarter Living', 'Control Made Easy', 'Upgrade Your Home', 'Live Connected', 'Simple Automation', 'Comfort on Command', 'Secure Your Space', 'Modern Home Tech', 'Tap. Control. Relax.', 'Smart Starts Here'.",
        "text_balance":    "Short and modern. Pick one phrase from text_options; tech disappears, the moment leads.",
        "tone_hint":       "Modern, helpful, calm, practical, smart, aspirational, trustworthy, simple, future-facing, lifestyle-led.",
        "content_types":   "Use-case post, home setup, feature benefit, lifestyle demo, security highlight, product comparison, new arrival, installation guide, convenience story, bundle offer.",
    },

    # ── Home & Lifestyle ──
    "Home decor": {
        "layout_emphasis": "Styled space. Wide enough to read the styling; tight enough to feel intimate.",
        "visual_focus":    "The styled scene — the corner the piece lives in, the surface it sits on.",
        "text_balance":    "Minimal — let the room speak.",
        "tone_hint":       "Calm, considered, aspirational.",
        "content_types":   "Styled vignettes, room-to-room before/after, seasonal refreshes, single-piece spotlights.",
    },
    "Furniture": {
        "layout_emphasis": "Room setups. Show the piece living in a believable space.",
        "visual_focus":    "The piece in a finished room — lit, dressed, occupied.",
        "text_balance":    "Short and warm: 'Made to live in', 'Built to last'.",
        "tone_hint":       "Warm, durable, honest about craft.",
        "content_types":   "Room setups, materials/finish detail, custom-make options, delivery-ready edits.",
    },
    "Kitchenware": {
        "layout_emphasis": "In-action shots. Hands using the product to make something real.",
        "visual_focus":    "The product mid-use — chopping, pouring, plating. Food + tool together.",
        "text_balance":    "Short and practical: 'Made for daily use', 'Dishwasher safe'.",
        "tone_hint":       "Practical, capable, joyful.",
        "content_types":   "Product-in-use moments, recipe pairings, set bundles, gift edits.",
    },
    "Bedding / home essentials": {
        "layout_emphasis": "Soft styled bed or close-up of texture (linen weave, towel pile).",
        "visual_focus":    "Texture and tactility — the fabric, the fold, the morning light.",
        "text_balance":    "Short and sensory: 'Sleep softer', 'Hotel-grade at home'.",
        "tone_hint":       "Calm, restful, premium.",
        "content_types":   "Set drops, fabric stories, seasonal swaps, gift edits.",
    },
    "Lighting": {
        "layout_emphasis": "Lit-room composition. The lamp does the lighting in the photo.",
        "visual_focus":    "The fixture casting real light on a real surface; mood is the product.",
        "text_balance":    "Minimal and evocative: 'Warm at 2700K', 'Sets the mood'.",
        "tone_hint":       "Atmospheric, considered.",
        "content_types":   "Mood-by-room features, dimming/colour stories, designer features, gift edits.",
    },

    # ── Health & Wellness ──
    "Supplements": {
        "layout_emphasis": "Product close-up + a simple benefit panel. Card-like containers feel trustworthy.",
        "visual_focus":    "The bottle / sachet / capsule on a clean surface with one ingredient cue.",
        "text_balance":    "Medium with a single clear claim: 'Energy without the crash', '30-day routine'.",
        "tone_hint":       "Trustworthy, evidence-aware. Promise the benefit, not the science.",
        "content_types":   "Benefit explainers, ingredient stories, routine pairings, customer outcomes (with care), restock alerts.",
    },
    "Fitness products": {
        "layout_emphasis": "Action-led. Mid-rep, mid-stretch, mid-run.",
        "visual_focus":    "Body in motion using the product — band, mat, weight, shoe.",
        "text_balance":    "Short and motivating: 'Train daily', 'Start with 10 min'.",
        "tone_hint":       "Energetic, encouraging, real.",
        "content_types":   "Workout demos, beginner routines, gear bundles, recovery features.",
    },
    "Wellness products": {
        "layout_emphasis": "Calm and clean. Real ritual moments — a candle lit, a mug held, a balm applied.",
        "visual_focus":    "The ritual + the product. Hands, skin, breath in soft natural light.",
        "text_balance":    "Medium and gentle: 'Your wind-down moment', 'For tense shoulders'.",
        "tone_hint":       "Soft, restorative, no-hype.",
        "content_types":   "Ritual moments, ingredient stories, gift edits, seasonal self-care.",
    },
    "Medical supplies": {
        "layout_emphasis": "Functional + trustworthy. Card-like containers; spec callouts visible.",
        "visual_focus":    "The product clearly shown with size / certification / use-case cues.",
        "text_balance":    "Specific and factual: model number, indication, certification.",
        "tone_hint":       "Clinical, calm, accurate. No hype, no ambiguity.",
        "content_types":   "Product specs, use-case explainers, compliance / certification cues, professional endorsements.",
    },

    # ── Digital Products ──
    "Courses / education": {
        "layout_emphasis": "Type-led hero with an outcome promise + a single artefact (lesson card, instructor headshot, syllabus snippet).",
        "visual_focus":    "The transformation — what the student becomes. Plus one instructor or platform-screen credibility cue.",
        "text_balance":    "Medium: outcome headline ('Go from zero to your first 5 clients') + one supporting line (duration / cohort start).",
        "tone_hint":       "Expert, generous, specific. Lean on outcomes and proof.",
        "content_types":   "Lesson previews, alumni outcomes, syllabus highlights, free-resource leads, cohort countdowns.",
    },
    "Ebooks": {
        "layout_emphasis": "Cover-led. The ebook cover taking the frame, with one promise nearby.",
        "visual_focus":    "The cover + a small reading-context cue (a phone, a tablet, a hand turning a page).",
        "text_balance":    "Short outcome: 'The 60-page guide to X'.",
        "tone_hint":       "Expert, accessible, unjargoned.",
        "content_types":   "Cover reveals, chapter previews, free-sample leads, reader testimonials.",
    },
    "Templates / design assets": {
        "layout_emphasis": "Show-the-template hero. Mockups of the asset in the destination tool (Notion, Figma, Canva, code).",
        "visual_focus":    "The asset itself, mocked into a real application screen.",
        "text_balance":    "Short and benefit-led: 'Save 4 hours per week', 'Drop-in pitch deck'.",
        "tone_hint":       "Practical, efficient, proof-led.",
        "content_types":   "Asset previews, before/after value, customisation moments, bundles.",
    },
    "Software / tools": {
        "layout_emphasis": "UI-screenshot hero with one feature called out.",
        "visual_focus":    "The product UI — a real screen of the tool doing its job.",
        "text_balance":    "Short outcome + one detail: 'Cut your reporting in half · 14-day free trial'.",
        "tone_hint":       "Confident, modern, outcome-focused.",
        "content_types":   "Feature spotlights, customer outcomes, integration callouts, change-log highlights.",
    },

    # ── Multi-product ──
    "General retail": {
        "layout_emphasis": "Bundle / collage hero. Multiple products composed as one offer.",
        "visual_focus":    "The selection — 'today's picks' / 'weekend essentials'. Consistent backdrop and lighting across items.",
        "text_balance":    "Medium and curatorial: 'Today's drop', '4 essentials, ₦15,000 in total'.",
        "tone_hint":       "Sales-driven, friendly, never pushy. Curate, don't shout.",
        "content_types":   "Daily picks, weekly bundles, restock alerts, seasonal edits, gift guides.",
    },
    "Dropshipping store": {
        "layout_emphasis": "Single product hero with one value claim. Credibility cues are non-negotiable (delivery time, returns, payment).",
        "visual_focus":    "The product on a clean backdrop with a single benefit callout.",
        "text_balance":    "Medium with a trust line: 'Free returns · Pay on delivery'.",
        "tone_hint":       "Sales-driven, transparent. Lean on shipping promises that build trust.",
        "content_types":   "Product spotlights, shipping reassurances, comparison vs alternatives, customer reactions.",
    },
    "Mixed catalog": {
        "layout_emphasis": "Category-of-the-day hero. Pick one slice of the catalog per post; treat it as that subcategory's design.",
        "visual_focus":    "Whatever category leads today (food / fashion / electronics) gets that subcategory's visual norms.",
        "text_balance":    "Medium and contextual to the slice. Stay consistent within a post; vary between posts.",
        "tone_hint":       "Curatorial. Speak as a buyer who knows their stock.",
        "content_types":   "Category-of-the-day, weekly arrivals, mixed-category bundles, staff picks.",
    },
}


DEFAULT_CATEGORY_CUES: CategoryCues = {
    "focus":           "Whatever the brand actually cares about — pick from product quality, customer outcome, value, trust, convenience.",
    "layout_emphasis": "Clear hierarchy with breathing space. Lead with one focal element and one supporting line — no clutter.",
    "visual_focus":    "Whatever the brand sells: the product, the service moment, or a real customer using it. Avoid generic stock.",
    "color_mood":      "Honour the brand's own palette. Use brand accent sparingly on calm neutrals.",
    "text_options":    "'Now Available', 'New Arrival', 'Made for You', 'Try It Today', 'Your Next Favourite', 'Available Now'.",
    "text_balance":    "Specific over generic. Headline names the thing; supporting copy gives one piece of proof or context.",
    "imagery_style":   "Real photography of the brand's actual subject (product / place / people). Avoid clichéd AI art and stock imagery.",
}


# Order matters in cues_as_text — this is the order the AI sees.
_CUE_FIELDS: tuple[str, ...] = (
    "focus",
    "layout_emphasis",
    "visual_focus",
    "color_mood",
    "text_options",
    "text_balance",
    "imagery_style",
    "tone_hint",
    "content_types",
)


def _normalise(value: str | None) -> str:
    return (value or "").strip()


def _lookup_in_table(needle: str, table: dict[str, CategoryCues]) -> CategoryCues | None:
    if not needle:
        return None
    if needle in table:
        return table[needle]
    lowered = needle.lower()
    for name, cues in table.items():
        if name.lower() == lowered:
            return cues
    # Loose containment fallback handles legacy strings (e.g. 'D2C Fashion')
    # finding a parent by name overlap. Sub-categories don't fall through this
    # path — only exact / case-insensitive matches count for sub-cat overrides.
    return None


def get_category_cues(
    category: str | None,
    sub_category: str | None = None,
) -> CategoryCues:
    """Resolve cues for a (category, sub_category) pair.

    Parent cues are looked up first (with a loose containment fallback for
    legacy stored values). When `sub_category` is supplied AND has its own
    entry in SUBCATEGORY_DESIGN_CUES, those fields override the parent's.
    Either argument may be empty; an empty pair resolves to DEFAULT_CATEGORY_CUES.

    The returned dict is always safe to pass to `cues_as_text` — every field
    has either a sub-cat value, a parent value, or no entry (in which case
    cues_as_text simply skips it).
    """
    parent_needle = _normalise(category)
    sub_needle = _normalise(sub_category)

    parent = _lookup_in_table(parent_needle, CATEGORY_DESIGN_CUES)
    if not parent and parent_needle:
        # Loose containment fallback for legacy 'D2C Fashion' → 'Fashion Store'.
        lowered = parent_needle.lower()
        for name, cues in CATEGORY_DESIGN_CUES.items():
            if name.lower() in lowered or lowered in name.lower():
                parent = cues
                break
    if parent is None:
        parent = DEFAULT_CATEGORY_CUES

    sub = _lookup_in_table(sub_needle, SUBCATEGORY_DESIGN_CUES) if sub_needle else None
    if sub is None:
        return dict(parent)

    # Sub-cat fields override parent fields (only the keys the sub-cat sets).
    merged = dict(parent)
    for k, v in sub.items():
        s = str(v or "").strip()
        if s:
            merged[k] = s
    return merged


def cues_as_text(cues: CategoryCues, *, label: str = "CATEGORY DESIGN CUES") -> str:
    """Render cues as a compact text block for prompts.

    Used in the strategist's per-post user message and in the AI text
    generator's brand_ctx so both stages honour the same direction.
    Skips any fields the cues dict doesn't set.
    """
    if not cues:
        return ""
    lines = [f"=== {label} ==="]
    for key in _CUE_FIELDS:
        v = str(cues.get(key) or "").strip()
        if v:
            lines.append(f"- {key.replace('_', ' ').title()}: {v}")
    return "\n".join(lines) if len(lines) > 1 else ""


def supported_categories() -> list[str]:
    """List of parent categories surfaced to the onboarding dropdown."""
    return list(CATEGORY_DESIGN_CUES.keys())


def supported_subcategories(category: str | None = None) -> list[str]:
    """List of sub-categories that have explicit cue overrides.

    When `category` is None, returns every sub-category we've taught.
    When set, returns only sub-categories whose canonical name is found
    under the given parent's INDUSTRY_TAXONOMY entry — matched here by
    a simple parent-name substring check since this module doesn't
    import the frontend taxonomy.
    """
    if not category:
        return list(SUBCATEGORY_DESIGN_CUES.keys())
    needle = category.strip().lower()
    return [s for s in SUBCATEGORY_DESIGN_CUES if needle in s.lower() or s.lower() in needle]
