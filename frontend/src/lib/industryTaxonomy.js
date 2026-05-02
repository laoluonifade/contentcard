// Commerce-first category system. Eight parents, every brand we onboard is a
// store of some kind. If a brand doesn't fit any of these, it isn't a fit
// for the product — keeping the list short keeps the AI focused.
export const INDUSTRY_TAXONOMY = {
  'Fashion Store': [
    'Streetwear brand',
    "Women's fashion",
    "Men's fashion",
    'Luxury fashion',
    'Activewear / fitness wear',
    'Thrift / resale',
    'Accessories (bags, jewelry)',
    'Footwear',
  ],
  'Beauty / Skincare Store': [
    'Skincare brand',
    'Makeup brand',
    'Hair products / wigs',
    'Organic / natural beauty',
    'Fragrance / perfumes',
  ],
  'Food Store': [
    'Restaurant',
    'Cloud kitchen',
    'Bakery / desserts',
    'Packaged food brand',
    'Drinks / smoothies / juice',
    'Grocery / food retail',
  ],
  'Electronics / Gadgets Store': [
    'Mobile phones',
    'Accessories (chargers, cases)',
    'Computers / laptops',
    'Gaming',
    'Smart devices',
  ],
  'Home & Lifestyle Store': [
    'Home decor',
    'Furniture',
    'Kitchenware',
    'Bedding / home essentials',
    'Lighting',
  ],
  'Health & Wellness Store': [
    'Supplements',
    'Fitness products',
    'Wellness products',
    'Medical supplies',
  ],
  'Digital Products Store': [
    'Courses / education',
    'Ebooks',
    'Templates / design assets',
    'Software / tools',
  ],
  'Multi-product Store (General Store)': [
    'General retail',
    'Dropshipping store',
    'Mixed catalog',
  ],
}

export const INDUSTRIES = Object.keys(INDUSTRY_TAXONOMY)
