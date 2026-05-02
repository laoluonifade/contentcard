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
        "focus":           "Hunger, immediacy, taste, freshness, location, ambience, menu variety, daily cravings, social dining, repeat visits.",
        "layout_emphasis": "Image-heavy with minimal overlays. Let the food fill the frame; type is a tag, not the headline.",
        "visual_focus":    "Real food close-ups, steam rising, sauce pours, hands eating, plates on table, warm lighting, restaurant environment, staff serving, texture shots, lively dining scenes.",
        "text_options":    "'Lunch Sorted', 'Hot & Fresh', 'Try This Today', 'Craving This?', 'Dinner Plans?', 'Freshly Made', 'Order Now', 'Today's Special', 'Bring Your Appetite', 'Made Hot'.",
        "text_balance":    "VERY short on the design (1-5 words max). Pick one phrase from text_options. Caption carries detail, hours, and the order link.",
        "tone_hint":       "Appetizing, urgent, warm, local, simple, direct, friendly, casual, energetic, crave-driven.",
        "content_types":   "Daily menu, combo offer, new dish, chef special, customer reaction, behind-the-kitchen, weekend dining, lunch promo, family meal, limited dish.",
    },
    "Cloud kitchen": {
        "focus":           "Delivery, speed, convenience, reliability, meal solutions, packaging, affordability, online ordering, repeat orders, no-stress eating.",
        "layout_emphasis": "Clean food shot on top, packaging or delivery cue underneath. Reads as 'order → arrives hot'.",
        "visual_focus":    "Packaged meals, delivery bags, food boxes, rider hand-off, clean food shots, app-style UI cues, kitchen prep, order-ready meals, product + phone, minimal backgrounds.",
        "text_options":    "'Delivered Hot', 'Order in Minutes', 'No Stress Meals', 'Fast & Fresh', 'Lunch at Your Door', 'Dinner Delivered', 'Tap to Order', 'Ready to Go', 'Hot Meals Fast', 'Your Cravings Delivered'.",
        "text_balance":    "Short with a clear CTA. Pick one phrase from text_options; caption carries hours + link.",
        "tone_hint":       "Fast, practical, direct, reliable, convenient, friendly, urgent, helpful, modern, order-focused.",
        "content_types":   "Delivery promo, meal combo, late-night food, lunch solution, ordering steps, packaging highlight, customer review, fast-delivery post, weekly menu, discount offer.",
    },
    "Bakery / desserts": {
        "focus":           "Indulgence, freshness, celebration, gifting, cravings, sweetness, occasions, texture, comfort, happiness.",
        "layout_emphasis": "Centered product. Soft glossy lighting; let the indulgence speak.",
        "visual_focus":    "Close-up cakes, dripping chocolate, icing texture, hands holding pastries, soft lighting, pastel backgrounds, cake slices, bakery counter, warm ovens, gift boxes.",
        "text_options":    "'Freshly Baked', 'Sweet Moments', 'Treat Yourself', 'Cake Day?', 'Made Fresh', 'Soft. Sweet. Perfect.', 'Dessert First', 'Order Your Cake', 'Baked with Love', 'A Sweet Bite'.",
        "text_balance":    "Minimal — the product does the selling. Pick one phrase from text_options.",
        "tone_hint":       "Warm, sweet, emotional, joyful, soft, inviting, celebratory, friendly, indulgent, comforting.",
        "content_types":   "Cake showcase, birthday orders, dessert highlight, baking process, customer order, seasonal treats, gifting campaign, limited flavour, behind the scenes, review post.",
    },
    "Packaged food brand": {
        "focus":           "Shelf appeal, brand memory, taste, packaging, convenience, snack moments, consistency, trust, mass-market appeal, repeat purchase.",
        "layout_emphasis": "Structured + clean. Product + lifestyle context (in a kitchen, on a desk, in a hand). Grid-friendly.",
        "visual_focus":    "Product pack hero, lifestyle snacking scenes, clean product shots, family or friends sharing, bright branded backgrounds, shelf-style layouts, product close-ups, ingredient cues, campaign visuals, seasonal setups.",
        "text_options":    "'Taste the Moment', 'Snack Better', 'Made for Every Craving', 'Open. Enjoy. Repeat.', 'Your Favourite Bite', 'Packed with Flavour', 'Always Ready', 'Share the Taste', 'Everyday Snack', 'Try It Today'.",
        "text_balance":    "Short and brand-driven. Pick one phrase from text_options; caption carries claims and stockists.",
        "tone_hint":       "Polished, friendly, consistent, emotional, mass-market, reliable, warm, brand-led, simple, memorable.",
        "content_types":   "Brand storytelling, product benefits, lifestyle moment, snack occasion, product lineup, customer reactions, campaign post, seasonal content, retail availability, flavour spotlight.",
    },
    "Drinks / smoothies / juice": {
        "focus":           "Refreshment, energy, health, flavour, freshness, cooling effect, lifestyle, thirst, natural ingredients, routine.",
        "layout_emphasis": "Dynamic. Splashes, pours, motion-frozen drips — the drink in action.",
        "visual_focus":    "Liquid splash, condensation, colourful fruits, bottle hero, people drinking, outdoor sunshine, motion pour, glass close-ups, vibrant gradients, lifestyle refreshment scenes.",
        "color_mood":      "Saturated and vibrant — fruit colours, ice blue, citrus yellow. Brand accent supports.",
        "text_options":    "'Stay Fresh', 'Sip Better', 'Freshly Blended', 'Cool Down', 'Taste the Freshness', 'Your Daily Boost', 'Drink Clean', 'Refresh Your Day', 'Made Fresh', 'Grab a Bottle'.",
        "text_balance":    "Very short. Pick one phrase from text_options; let the splash carry the rest.",
        "tone_hint":       "Energetic, fresh, vibrant, healthy, simple, youthful, uplifting, lively, refreshing, friendly.",
        "content_types":   "Flavour spotlight, health benefit, daily drink routine, product hero, customer photo, ingredient post, promo offer, hot-weather post, bundle pack, new flavour launch.",
    },
    "Grocery / food retail": {
        "focus":           "Variety, affordability, household needs, convenience, weekly shopping, deals, availability, freshness, bundles, value.",
        "layout_emphasis": "Grid or bundle layout — multiple products composed together as one offer.",
        "visual_focus":    "Product grids, basket shots, shelf-style layouts, family shopping scenes, multiple SKUs, clear price tags, clean retail backgrounds, bundle packs, fresh produce, simple promo banners.",
        "text_options":    "'Weekend Deals', 'Stock Up Today', 'Fresh Picks', 'Shop Essentials', 'Your Grocery Run', 'Save More', 'New Arrivals', 'Everything You Need', 'Bundle & Save', 'Available Now'.",
        "text_balance":    "Medium ('3 for ₦5,000'). Pick one phrase from text_options; lists and price tiers are OK.",
        "tone_hint":       "Practical, value-driven, clear, helpful, friendly, straightforward, community-oriented, deal-focused, reliable, accessible.",
        "content_types":   "Weekly deals, product bundles, new stock, fresh produce, household essentials, price promo, shopping reminder, seasonal items, back-in-stock, top picks.",
    },

    # ── Fashion Store ──
    "Streetwear brand": {
        "focus":           "Culture, identity, drops, exclusivity, street credibility, community, hype, self-expression, scarcity, youth energy.",
        "layout_emphasis": "Editorial. Cropped portraits, urban backgrounds, UGC-style mixed in.",
        "visual_focus":    "Urban streets, real models, graffiti walls, raw photography, oversized fits, motion blur, night shots, concrete textures, editorial poses, UGC-style shots.",
        "text_options":    "'New Drop', 'Out Now', 'Limited Run', 'Don't Sleep', 'For the Culture', 'Tap In', 'Built Different', 'Fresh Drop', 'Only Few Left', 'Wear the Mood'.",
        "text_balance":    "Minimal on the design — pick one phrase from text_options. Caption carries the drop time + link.",
        "tone_hint":       "Bold, confident, youthful, edgy, casual, hype-driven, expressive, culture-first, slightly rebellious — never corporate.",
        "content_types":   "Drop announcement, outfit inspo, customer fit check, behind the scenes, limited stock alert, founder note, street shoot, influencer style, culture post, restock alert.",
    },
    "Women's fashion": {
        "focus":           "Style confidence, elegance, occasions, lifestyle, beauty, fit, new arrivals, aspiration, everyday looks, self-expression.",
        "layout_emphasis": "Clean and airy. Single styled outfit on a calm backdrop or in a lifestyle moment.",
        "visual_focus":    "Model-led shots, soft lighting, full-body outfit views, lifestyle locations, mirror selfies, clean studio shots, feminine palettes, movement, detail shots, aspirational settings.",
        "text_options":    "'New In', 'Style It Your Way', 'Made to Stand Out', 'Weekend Ready', 'Your Next Look', 'Soft Life Fit', 'Dress the Mood', 'Outfit Goals', 'Wear Confidence', 'Now Available'.",
        "text_balance":    "Short and aspirational. Pick one phrase from text_options; caption carries styling notes and price.",
        "tone_hint":       "Stylish, warm, aspirational, confident, feminine, polished, inviting, expressive, trendy, approachable.",
        "content_types":   "Outfit inspiration, new arrival, styling tips, occasion looks, customer photos, collection highlight, restock update, bestsellers, seasonal edit, sale post.",
    },
    "Men's fashion": {
        "focus":           "Confidence, simplicity, fit, quality, everyday utility, clean styling, masculinity, wardrobe essentials, status, versatility.",
        "layout_emphasis": "Clean fits, controlled composition. Confident hero shots.",
        "visual_focus":    "Clean model shots, neutral backgrounds, sharp poses, street or studio scenes, close-up fabric details, simple layouts, strong contrast, relaxed lifestyle shots, full outfit frames, premium textures.",
        "text_options":    "'Clean Fit', 'New Essentials', 'Built for Style', 'Upgrade Your Look', 'Sharp Everyday', 'Simple. Confident.', 'Now Available', 'Fresh Arrival', 'Own the Look', 'Made to Fit'.",
        "text_balance":    "Minimal and direct. One phrase from text_options carries the design.",
        "tone_hint":       "Direct, confident, clean, practical, premium, understated, sharp, masculine, simple, stylish.",
        "content_types":   "Outfit ideas, essentials edit, new collection, styling guide, product hero, before-and-after styling, customer fit, bestsellers, restock alert, seasonal looks.",
    },
    "Luxury fashion": {
        "focus":           "Exclusivity, craftsmanship, premium quality, elegance, scarcity, refinement, timelessness, high status, material detail, brand prestige.",
        "layout_emphasis": "Restrained, exclusive. Generous negative space; one element in the frame. Editorial spacing.",
        "visual_focus":    "Minimal layouts, neutral tones, elegant photography, close-up details, slow-luxury mood, polished studio shots, premium lighting, clean backgrounds, high-fashion poses, single-element frames.",
        "color_mood":      "Restrained editorial — bone, ivory, charcoal, deep brand jewel tone. Never bright sale-block colours.",
        "text_options":    "'Timeless', 'Crafted Elegance', 'Limited Pieces', 'The New Standard', 'Refined Luxury', 'Quiet Confidence', 'Now Available', 'Made to Last', 'Pure Detail', 'Elevated Essentials'.",
        "text_balance":    "VERY minimal — sometimes just the brand mark, a date, or a single phrase from text_options.",
        "tone_hint":       "Refined, calm, exclusive, premium, subtle, elegant, confident, aspirational, polished — never loud.",
        "content_types":   "Collection reveal, craftsmanship story, product detail, luxury lifestyle, limited release, editorial campaign, founder note, occasion styling, premium lookbook, waitlist post.",
    },
    "Activewear / fitness wear": {
        "focus":           "Movement, performance, comfort, strength, body confidence, durability, gym lifestyle, flexibility, motivation, active routine.",
        "layout_emphasis": "Motion-led. Mid-action shots in real training context.",
        "visual_focus":    "People exercising, sweat and motion, gym scenes, outdoor fitness, close-up fabric stretch, action poses, bold lighting, energetic backgrounds, product in use, real athletic bodies (never oversexualised).",
        "text_options":    "'Move Better', 'Built to Perform', 'Train in Comfort', 'Sweat Ready', 'Strong Looks Good', 'Fit for Motion', 'No Excuses', 'New Active Drop', 'Every Rep Counts', 'Ready to Move'.",
        "text_balance":    "Short and direct. One phrase from text_options; caption carries fabric / fit detail.",
        "tone_hint":       "Energetic, motivational, strong, practical, confident, empowering, direct, active, modern, performance-led.",
        "content_types":   "Workout fit, product performance, gym motivation, new collection, customer workout, routine post, fabric benefit, active lifestyle, transformation story, sale campaign.",
    },
    "Thrift / resale": {
        "focus":           "Affordability, uniqueness, rare finds, sustainability, discovery, limited pieces, value, nostalgia, personal style, fast-purchase urgency.",
        "layout_emphasis": "Editorial flatlay or single-piece spotlight. Each piece is one-of-one — treat it that way.",
        "visual_focus":    "Rack shots, mirror selfies, flat lays, vintage textures, before-and-after styling, casual phone photography, real product photos, mixed-item grids, street style, natural lighting.",
        "text_options":    "'One of One', 'Thrift Find', 'Only One Available', 'Grab This', 'Fresh Drop', 'Budget Drip', 'Rare Piece', 'New Finds', 'Sustainable Style', 'Gone Soon'.",
        "text_balance":    "Short with the size + price ('Size M · ₦12,000 · 1 left'). Scarcity IS the urgency.",
        "tone_hint":       "Fun, urgent, casual, value-driven, youthful, expressive, community-led, playful, accessible, discovery-focused.",
        "content_types":   "Thrift drop, item highlight, styling idea, price deal, before-and-after outfit, customer find, limited stock, bundle offer, weekly picks, sold-out recap.",
    },
    "Accessories (bags, jewelry)": {
        "focus":           "Detail, finishing touch, gifting, premium feel, personal style, versatility, small luxury, everyday use, close-up beauty, add-on purchase.",
        "layout_emphasis": "Close-up macro detail. The frame is mostly material and craft.",
        "visual_focus":    "Macro shots, hands wearing items, clean flat lays, jewelry detail, bag close-ups, styled outfits, soft shadows, premium props, minimal backgrounds, lifestyle scenes.",
        "text_options":    "'The Final Touch', 'Small Detail. Big Look.', 'New Accessories', 'Style Upgrade', 'Gift Ready', 'Made to Shine', 'Everyday Detail', 'Complete the Look', 'Now Available', 'Your Next Favourite'.",
        "text_balance":    "Short with one specific noun ('the gold loop', 'the handwoven strap'). Pick one phrase from text_options.",
        "tone_hint":       "Stylish, polished, elegant, simple, premium, warm, aspirational, detail-focused, conversion-led; feminine or neutral depending on brand.",
        "content_types":   "Product detail, gift guide, styling tips, close-up showcase, bundle post, new collection, customer style, occasion post, bestseller, limited stock.",
    },
    "Footwear": {
        "focus":           "Comfort, style, durability, movement, street appeal, fit, quality, new drops, versatility, confidence.",
        "layout_emphasis": "Strong-angle product hero. The shoe at 3/4 view or laid against a contrast wall.",
        "visual_focus":    "Low-angle shoe shots, walking motion, street backgrounds, product hero, sole detail, outfit pairing, lifestyle scenes, clean studio shots, close-ups, bold shadows.",
        "text_options":    "'Step Different', 'New Drop', 'Built for Comfort', 'Fresh Pair', 'Walk Bold', 'Everyday Steps', 'Limited Pairs', 'Your Next Pair', 'Style Starts Here', 'Now Available'.",
        "text_balance":    "Minimal — model name + colour ('Vela · Burnt sand') or one phrase from text_options.",
        "tone_hint":       "Confident, bold, practical, stylish, energetic, direct, youthful, action-led, simple; premium or casual depending on brand.",
        "content_types":   "Product hero, new arrival, outfit pairing, comfort benefit, customer fit, drop alert, limited stock, unboxing, comparison, seasonal style.",
    },

    # ── Beauty / Skincare ──
    "Skincare brand": {
        "focus":           "Results, routine, trust, ingredients, transformation, skin concerns, consistency, education, proof, self-care.",
        "layout_emphasis": "Product close-up or skin close-up. Breathing space; everything else is calm.",
        "visual_focus":    "Skin close-ups, clean product shots, bathroom routines, hands applying product, soft natural light, real skin texture, neutral palettes, before-and-after frames, product-and-face pairing, minimal clinical layouts.",
        "text_options":    "'Glow Starts Here', 'Clear Skin Routine', 'Hydrate Daily', 'Fix Your Routine', 'For Healthier Skin', 'Simple Skincare', 'Results Take Consistency', 'Your Skin Needs This', 'Gentle but Effective', 'Start Here'.",
        "text_balance":    "Medium: promise the outcome ('Plump in 14 days', 'Glow that lasts'). Pick one phrase from text_options; caption can name a key ingredient or claim.",
        "tone_hint":       "Trustworthy, calm, educational, reassuring, clean, expert, honest, gentle, helpful, non-hype.",
        "content_types":   "Routine guide, ingredient education, before-and-after, myth busting, product benefit, customer testimonial, skin-concern solution, morning routine, night routine, new product launch.",
    },
    "Makeup brand": {
        "focus":           "Transformation, expression, confidence, colour payoff, beauty looks, creativity, tutorials, occasions, glam, self-expression.",
        "layout_emphasis": "Before/after split or lip/eye close-up. Bold colour leads.",
        "visual_focus":    "Face close-ups, bold makeup looks, swatches, before-and-after, brushes in action, model photography, colourful backgrounds, mirror shots, texture close-ups, beauty studio lighting.",
        "text_options":    "'Glow Up', 'Soft Glam', 'Full Beat', 'Colour That Pops', 'Makeup Mood', 'Get the Look', 'Blend Better', 'Your Glam Kit', 'New Shade Drop', 'Ready to Slay'.",
        "text_balance":    "Short and expressive. Pick one phrase from text_options; pigment / texture does the heavy lifting.",
        "tone_hint":       "Expressive, confident, playful, stylish, energetic, feminine, bold, trend-aware, beauty-led, aspirational.",
        "content_types":   "Tutorial, shade reveal, before-and-after, product demo, customer look, glam inspiration, launch post, makeup tips, occasion look, creator UGC.",
    },
    "Hair products / wigs": {
        "focus":           "Transformation, confidence, styling, quality, durability, texture, maintenance, beauty, convenience, identity.",
        "layout_emphasis": "Model-led. Full hair in motion or styled close-up.",
        "visual_focus":    "Models wearing wigs, hair movement, close-up texture, before-and-after, salon-style shots, mirror selfies, clean product packaging, styling process, outdoor glam shots, human-focused visuals.",
        "text_options":    "'New Hair Energy', 'Wear Confidence', 'Soft. Full. Beautiful.', 'Your Next Look', 'Ready to Install', 'Luxury Hair', 'No Bad Hair Days', 'Style Made Easy', 'Fresh Wig Drop', 'Look Good Instantly'.",
        "text_balance":    "Short and tactile ('Body wave 22\"', 'Locked in for weeks'). Pick one phrase from text_options or name the spec.",
        "tone_hint":       "Confident, glamorous, feminine, reassuring, stylish, premium, practical, expressive, beauty-first, empowering.",
        "content_types":   "Wig install, before-and-after, hair-care tip, product showcase, customer transformation, styling ideas, new arrival, maintenance guide, testimonial, restock post.",
    },
    "Organic / natural beauty": {
        "focus":           "Clean ingredients, nature, gentleness, wellness, safety, simplicity, trust, skin nourishment, sustainability, purity.",
        "layout_emphasis": "Earthy, soft, natural. Product on linen / wood / stone with botanical props.",
        "visual_focus":    "Earthy tones, leaves and natural textures, product with raw ingredients, soft sunlight, minimal packaging shots, hands applying product, bathroom or spa scenes, calm backgrounds, organic props, warm close-ups.",
        "color_mood":      "Earth tones — moss, oat, terracotta, clay. Brand accent kept calm.",
        "text_options":    "'Naturally Gentle', 'Clean Beauty', 'Made with Care', 'Glow Naturally', 'Pure Ingredients', 'Soft on Skin', 'Nature for Your Skin', 'Simple. Clean. Effective.', 'No Harshness', 'Beauty from Nature'.",
        "text_balance":    "Medium and grounded. Lean on real ingredient names, not vague 'clean' claims. Pick one phrase from text_options.",
        "tone_hint":       "Soft, natural, trustworthy, calm, wholesome, gentle, educational, transparent, warm, wellness-driven.",
        "content_types":   "Ingredient spotlight, product benefits, routine post, founder story, customer feedback, sustainability note, how-to-use, skin-concern education, behind the scenes, product launch.",
    },
    "Fragrance / perfumes": {
        "focus":           "Emotion, memory, luxury, attraction, identity, gifting, mood, occasion, elegance, sensual experience.",
        "layout_emphasis": "Cinematic, mood-led. The bottle in light + a single emotional cue.",
        "visual_focus":    "Cinematic product shots, glass bottle close-ups, shadows, moody lighting, flowers or luxury props, lifestyle scenes, elegant hands, textured backgrounds, mist effect, premium editorial framing.",
        "text_options":    "'Smell Unforgettable', 'Your Signature Scent', 'Luxury in a Bottle', 'Soft but Loud', 'Made to Be Remembered', 'Date Night Ready', 'Mood in a Bottle', 'Gift the Scent', 'Scent That Speaks', 'Now Available'.",
        "text_balance":    "Very minimal — sometimes just the scent name, sometimes a single phrase from text_options.",
        "tone_hint":       "Sensual but tasteful, premium, emotional, elegant, poetic, aspirational, confident, intimate, refined, memorable.",
        "content_types":   "Scent profile, gifting post, occasion-based content, customer testimonial, product hero, mood board, launch post, fragrance notes, comparison, luxury lifestyle post.",
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
        "focus":           "Aesthetics, ambience, self-expression, room transformation, comfort, taste, lifestyle, mood, elegance, inspiration.",
        "layout_emphasis": "Styled space. Wide enough to read the styling; tight enough to feel intimate.",
        "visual_focus":    "Styled rooms, vases, wall art, soft light, interior setups, before-and-after spaces, neutral palettes, cozy corners, close-up textures, Pinterest-style layouts.",
        "text_options":    "'Style Your Space', 'Home Feels Better', 'Room Refresh', 'Small Touch. Big Mood.', 'Decor That Speaks', 'Make It Yours', 'Cozy Corners', 'Fresh Home Energy', 'Your Space, Elevated', 'Add Warmth'.",
        "text_balance":    "Minimal — let the room speak. Pick one phrase from text_options if any.",
        "tone_hint":       "Calm, aspirational, warm, stylish, elegant, inviting, soft, lifestyle-led, polished, comforting.",
        "content_types":   "Room inspiration, product spotlight, before-and-after, styling tips, decor bundles, seasonal home edit, customer homes, new arrivals, mood board, gift ideas.",
    },
    "Furniture": {
        "focus":           "Comfort, durability, room transformation, quality, functionality, space planning, lifestyle, premium feel, family use, long-term value.",
        "layout_emphasis": "Room setups. Show the piece living in a believable space.",
        "visual_focus":    "Full room setups, sofas in living rooms, dining sets, human interaction, warm lighting, clean interiors, close-up fabric, before-and-after rooms, spacious layouts, lifestyle photography.",
        "text_options":    "'Comfort Starts Here', 'Upgrade Your Space', 'Built for Home', 'Sit Better', 'Made to Last', 'Room Refresh', 'Your New Favourite Spot', 'Designed for Living', 'Bring Comfort Home', 'New Arrival'.",
        "text_balance":    "Short and warm. Pick one phrase from text_options; let the room sell itself.",
        "tone_hint":       "Warm, trustworthy, practical, premium, calm, family-friendly, value-led, aspirational, stable, comforting.",
        "content_types":   "Product hero, room setup, before-and-after, comfort feature, material highlight, customer home, bundle set, new collection, care tips, limited offer.",
    },
    "Kitchenware": {
        "focus":           "Usefulness, cooking convenience, durability, daily routine, organization, home efficiency, gifting, quality, food prep, lifestyle.",
        "layout_emphasis": "In-action shots. Hands using the product to make something real.",
        "visual_focus":    "Kitchen scenes, hands cooking, utensils in use, clean counters, product close-ups, organized shelves, food-prep action, warm lighting, before-and-after organization, product bundles.",
        "text_options":    "'Cook Smarter', 'Kitchen Essentials', 'Meal Prep Made Easy', 'Better Tools. Better Meals.', 'Upgrade Your Kitchen', 'Built for Daily Use', 'Organize Better', 'Serve in Style', 'Your Cooking Partner', 'Home Chef Ready'.",
        "text_balance":    "Short and practical. Pick one phrase from text_options.",
        "tone_hint":       "Practical, helpful, warm, domestic, clear, value-driven, friendly, useful, simple, reliable.",
        "content_types":   "Product demo, cooking tip, kitchen organization, bundle offer, use case, before-and-after, gift guide, new arrival, care guide, customer kitchen.",
    },
    "Bedding / home essentials": {
        "focus":           "Comfort, rest, softness, quality, wellness, better sleep, home freshness, everyday use, relaxation, premium feel.",
        "layout_emphasis": "Soft styled bed or close-up of texture (linen weave, towel pile).",
        "visual_focus":    "Cozy beds, soft fabrics, morning light, bedroom scenes, texture close-ups, people relaxing, neutral palettes, folded linens, calm interiors, hotel-style setups.",
        "text_options":    "'Sleep Better', 'Softness You'll Love', 'Bedroom Refresh', 'Rest Easy', 'Hotel Feel at Home', 'Cozy Starts Here', 'Upgrade Your Sleep', 'Fresh Sheets Feeling', 'Comfort Every Night', 'Made for Rest'.",
        "text_balance":    "Short and sensory. Pick one phrase from text_options.",
        "tone_hint":       "Calm, soothing, warm, premium, gentle, reassuring, cozy, lifestyle-led, restful, inviting.",
        "content_types":   "Product benefit, bedroom makeover, comfort story, fabric detail, customer review, care tips, bundle offer, seasonal refresh, new collection, sleep routine.",
    },
    "Lighting": {
        "focus":           "Ambience, mood, room transformation, style, functionality, warmth, aesthetics, energy, decor enhancement, modern living.",
        "layout_emphasis": "Lit-room composition. The lamp does the lighting in the photo.",
        "visual_focus":    "Lit rooms, lamp close-ups, before-and-after lighting, warm glow, evening scenes, modern interiors, shadows, pendant lights, cozy corners, architectural spaces.",
        "text_options":    "'Set the Mood', 'Light Up Your Space', 'Warm Glow', 'Room Transformation', 'Mood Made Easy', 'Better Lighting', 'Glow Different', 'Designed to Shine', 'Brighten Your Home', 'New Lighting Drop'.",
        "text_balance":    "Minimal and evocative. Pick one phrase from text_options or call out colour temperature ('Warm at 2700K').",
        "tone_hint":       "Warm, stylish, calm, aspirational, modern, elegant, mood-driven, polished, helpful, atmospheric.",
        "content_types":   "Before-and-after, product hero, room inspiration, lighting tips, ambience post, new arrival, installation idea, customer room, decor pairing, seasonal mood.",
    },

    # ── Health & Wellness ──
    "Supplements": {
        "focus":           "Benefits, consistency, trust, wellness routine, energy, immunity, lifestyle, product quality, education, safe usage.",
        "layout_emphasis": "Product close-up + a simple benefit panel. Card-like containers feel trustworthy.",
        "visual_focus":    "Clean product shots, people in healthy routines, morning scenes, fitness / wellness context, ingredient cues, minimal backgrounds, lifestyle shots, product with water or smoothie, soft clinical design, organized shelf shots.",
        "text_options":    "'Daily Wellness', 'Support Your Routine', 'Feel Better Daily', 'Energy Support', 'Wellness Starts Here', 'Consistency Matters', 'Your Daily Boost', 'Health Made Simple', 'Support Your Body', 'Start Today'.",
        "text_balance":    "Medium with a single clear claim ('Energy without the crash', '30-day routine'). Pick one phrase from text_options. Promise the benefit, not the science.",
        "tone_hint":       "Trustworthy, educational, careful, clear, health-conscious, non-exaggerated, calm, helpful, responsible, professional.",
        "content_types":   "Benefit education, routine post, ingredient spotlight, FAQ, product guide, customer feedback, wellness tips, bundle offer, myth busting, new product.",
    },
    "Fitness products": {
        "focus":           "Strength, progress, performance, home workout, motivation, durability, results, daily action, convenience, transformation.",
        "layout_emphasis": "Action-led. Mid-rep, mid-stretch, mid-run.",
        "visual_focus":    "People using products, gym or home workout scenes, motion shots, sweat, resistance bands or equipment in action, energetic lighting, before-and-after setup, bold compositions, product close-ups, active lifestyle.",
        "text_options":    "'Train Better', 'Home Workout Ready', 'Move Daily', 'Built for Progress', 'Stronger Every Day', 'No Excuses', 'Workout Anywhere', 'Gear Up', 'Your Fitness Partner', 'Start Moving'.",
        "text_balance":    "Short and motivating. Pick one phrase from text_options.",
        "tone_hint":       "Energetic, motivating, practical, strong, encouraging, direct, confident, action-led, supportive, performance-focused.",
        "content_types":   "Product demo, workout routine, fitness challenge, transformation story, equipment benefit, customer use, bundle offer, beginner guide, motivational post, new arrival.",
    },
    "Wellness products": {
        "focus":           "Relaxation, balance, self-care, stress relief, lifestyle improvement, daily rituals, comfort, mood, mindfulness, routine.",
        "layout_emphasis": "Calm and clean. Real ritual moments — a candle lit, a mug held, a balm applied.",
        "visual_focus":    "Calm lifestyle scenes, spa-like setups, soft lighting, people relaxing, bathroom or bedroom context, product with candles or towels, neutral tones, slow mood, nature elements, clean close-ups.",
        "text_options":    "'Relax More', 'Your Self-Care Ritual', 'Feel Balanced', 'Slow Down', 'Wellness at Home', 'Breathe Better', 'Reset Your Day', 'Daily Calm', 'Made for You', 'Comfort Starts Here'.",
        "text_balance":    "Medium and gentle. Pick one phrase from text_options.",
        "tone_hint":       "Calm, supportive, soft, warm, reassuring, gentle, lifestyle-led, mindful, helpful, soothing.",
        "content_types":   "Self-care routine, product benefit, wellness tip, gift guide, morning / evening ritual, customer feedback, lifestyle post, bundle offer, how-to-use, seasonal wellness.",
    },
    "Medical supplies": {
        "focus":           "Trust, reliability, safety, availability, practical use, accessibility, care, quality, necessity, clear information.",
        "layout_emphasis": "Functional + trustworthy. Card-like containers; spec callouts visible.",
        "visual_focus":    "Clean product shots, clinical backgrounds, organized supplies, caregiver context, hands using product, simple diagrams, white-and-blue palettes, clear layouts, packaging shots, professional lighting.",
        "text_options":    "'Reliable Care', 'Available Now', 'Health Essentials', 'Care Made Easier', 'Trusted Supplies', 'Ready When Needed', 'Quality You Can Trust', 'Support at Home', 'Order Essentials', 'Safe. Simple. Reliable.'.",
        "text_balance":    "Specific and factual: model number, indication, certification. Pick one phrase from text_options for the headline.",
        "tone_hint":       "Professional, clear, trustworthy, calm, practical, serious, helpful, reassuring, respectful, precise.",
        "content_types":   "Product availability, usage guide, caregiver tips, bundle packs, restock notice, trust post, product explanation, FAQ, safety reminder, delivery availability.",
    },

    # ── Digital Products ──
    "Courses / education": {
        "focus":           "Transformation, learning outcome, career growth, skill acquisition, clarity, progress, confidence, access, expertise, future value.",
        "layout_emphasis": "Type-led hero with an outcome promise + a single artefact (lesson card, instructor headshot, syllabus snippet).",
        "visual_focus":    "Laptop learning scenes, instructor screenshots, course mockups, dashboard previews, student lifestyle, bold educational graphics, before-and-after career framing, certificate visuals, clean UI cards, focused study scenes.",
        "text_options":    "'Learn This Skill', 'Start Today', 'Build Your Future', 'From Beginner to Pro', 'Skill Up', 'Master the Basics', 'Your Next Level', 'Learn at Your Pace', 'Unlock Growth', 'Join the Class'.",
        "text_balance":    "Medium: outcome headline ('Go from zero to your first 5 clients') + one supporting line (duration / cohort start). Pick one phrase from text_options.",
        "tone_hint":       "Expert, encouraging, clear, helpful, aspirational, practical, confident, educational, supportive, motivating.",
        "content_types":   "Course benefit, module preview, student result, instructor insight, learning tip, enrolment promo, FAQ, before-and-after knowledge, testimonial, limited cohort.",
    },
    "Ebooks": {
        "focus":           "Knowledge, simplicity, problem-solving, quick wins, expert insight, downloadable value, self-improvement, convenience, affordability, clarity.",
        "layout_emphasis": "Cover-led. The ebook cover taking the frame, with one promise nearby.",
        "visual_focus":    "Ebook mockups, tablet or phone screens, clean cover designs, reading scenes, desk setups, highlight pages, simple typography, benefit-led graphics, lifestyle education shots, soft backgrounds.",
        "text_options":    "'Download the Guide', 'Learn Faster', 'Your Quick Guide', 'Read This First', 'Simple Steps', 'Knowledge in One Place', 'Start Reading', 'Practical Lessons', 'Get the Ebook', 'Your Shortcut'.",
        "text_balance":    "Short outcome ('The 60-page guide to X'). Pick one phrase from text_options.",
        "tone_hint":       "Helpful, informative, practical, clear, direct, expert, approachable, value-driven, simple, confident.",
        "content_types":   "Ebook launch, chapter preview, key lessons, problem-solution post, reader testimonial, author note, limited discount, checklist preview, quote from book, bonus offer.",
    },
    "Templates / design assets": {
        "focus":           "Speed, productivity, ease, quality, plug-and-play value, professional output, time-saving, creator utility, consistency, immediate use.",
        "layout_emphasis": "Show-the-template hero. Mockups of the asset in the destination tool (Notion, Figma, Canva, code).",
        "visual_focus":    "Template previews, before-and-after designs, UI mockups, layered grids, desktop screens, colourful design thumbnails, clean product cards, workflow visuals, creator desk setups, editable file previews.",
        "text_options":    "'Create Faster', 'Plug & Play', 'Save Time', 'Ready Templates', 'Design in Minutes', 'Your Shortcut', 'Editable Files', 'Work Smarter', 'Instant Download', 'Professional Look'.",
        "text_balance":    "Short and benefit-led ('Save 4 hours per week', 'Drop-in pitch deck'). Pick one phrase from text_options.",
        "tone_hint":       "Practical, efficient, creator-friendly, clear, upbeat, helpful, productivity-led, modern, direct, value-focused.",
        "content_types":   "Template preview, before-and-after, use case, tutorial, bundle offer, creator testimonial, product launch, feature highlight, niche template post, discount promo.",
    },
    "Software / tools": {
        "focus":           "Productivity, automation, problem-solving, workflow improvement, time saving, business outcome, ease of use, reliability, integrations, growth.",
        "layout_emphasis": "UI-screenshot hero with one feature called out.",
        "visual_focus":    "UI screenshots, dashboard mockups, laptop screens, workflow diagrams, before-and-after process, clean SaaS graphics, founder or team context, product demo frames, charts, minimal tech layouts.",
        "text_options":    "'Save Time', 'Automate This', 'Work Smarter', 'Grow Faster', 'Your Workflow Upgrade', 'Less Manual Work', 'Built for Teams', 'Start Free', 'Simplify Operations', 'Do More'.",
        "text_balance":    "Short outcome + one detail ('Cut your reporting in half · 14-day free trial'). Pick one phrase from text_options.",
        "tone_hint":       "Smart, clear, confident, helpful, modern, practical, outcome-driven, slightly technical, professional, simple.",
        "content_types":   "Feature launch, use case, product demo, customer story, workflow tip, comparison, founder insight, problem-solution post, integration highlight, free-trial campaign.",
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
