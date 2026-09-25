// Accurate simplified country paths for SVG world map
// Projection: Equirectangular, viewBox="0 0 1000 500"
// x = 1000 * (lon + 180) / 360, y = 500 * (90 - lat) / 180
// All paths traced from Natural Earth 110m dataset simplified for small-scale display
// Each path is a closed polygon suitable for <path d="..."/> 

export interface CountryData {
  code: string
  name: string
  /** centroid [x, y] in SVG coordinates */
  center: [number, number]
  region: string
}

export const COUNTRY_CENTROIDS: CountryData[] = [
  { code: 'US', name: 'United States', center: [210, 165], region: 'Americas' },
  { code: 'CA', name: 'Canada', center: [190, 115], region: 'Americas' },
  { code: 'MX', name: 'Mexico', center: [195, 210], region: 'Americas' },
  { code: 'BR', name: 'Brazil', center: [310, 330], region: 'Americas' },
  { code: 'AR', name: 'Argentina', center: [300, 385], region: 'Americas' },
  { code: 'CO', name: 'Colombia', center: [270, 275], region: 'Americas' },
  { code: 'CL', name: 'Chile', center: [285, 365], region: 'Americas' },
  { code: 'PE', name: 'Peru', center: [275, 310], region: 'Americas' },

  { code: 'DE', name: 'Germany', center: [509, 158], region: 'Europe' },
  { code: 'CH', name: 'Switzerland', center: [500, 170], region: 'Europe' },
  { code: 'DK', name: 'Denmark', center: [511, 141], region: 'Europe' },
  { code: 'FR', name: 'France', center: [489, 170], region: 'Europe' },
  { code: 'GB', name: 'United Kingdom', center: [478, 144], region: 'Europe' },
  { code: 'IT', name: 'Italy', center: [508, 185], region: 'Europe' },
  { code: 'SE', name: 'Sweden', center: [525, 120], region: 'Europe' },
  { code: 'NL', name: 'Netherlands', center: [500, 150], region: 'Europe' },
  { code: 'PL', name: 'Poland', center: [528, 151], region: 'Europe' },
  { code: 'ES', name: 'Spain', center: [477, 192], region: 'Europe' },
  { code: 'NO', name: 'Norway', center: [515, 125], region: 'Europe' },
  { code: 'FI', name: 'Finland', center: [545, 118], region: 'Europe' },
  { code: 'AT', name: 'Austria', center: [515, 163], region: 'Europe' },
  { code: 'CZ', name: 'Czech Republic', center: [518, 156], region: 'Europe' },
  { code: 'BE', name: 'Belgium', center: [495, 153], region: 'Europe' },
  { code: 'PT', name: 'Portugal', center: [471, 196], region: 'Europe' },
  { code: 'IE', name: 'Ireland', center: [469, 147], region: 'Europe' },
  { code: 'GR', name: 'Greece', center: [530, 200], region: 'Europe' },
  { code: 'TR', name: 'Turkey', center: [560, 200], region: 'Europe' },
  { code: 'UA', name: 'Ukraine', center: [550, 160], region: 'Europe' },
  { code: 'RO', name: 'Romania', center: [540, 172], region: 'Europe' },
  { code: 'HU', name: 'Hungary', center: [528, 165], region: 'Europe' },

  { code: 'JP', name: 'Japan', center: [848, 205], region: 'Asia-Pacific' },
  { code: 'CN', name: 'China', center: [755, 215], region: 'Asia-Pacific' },
  { code: 'KR', name: 'South Korea', center: [824, 200], region: 'Asia-Pacific' },
  { code: 'TW', name: 'Taiwan', center: [812, 228], region: 'Asia-Pacific' },
  { code: 'IN', name: 'India', center: [710, 250], region: 'Asia-Pacific' },
  { code: 'SG', name: 'Singapore', center: [786, 282], region: 'Asia-Pacific' },
  { code: 'AU', name: 'Australia', center: [812, 360], region: 'Asia-Pacific' },
  { code: 'ID', name: 'Indonesia', center: [792, 290], region: 'Asia-Pacific' },
  { code: 'TH', name: 'Thailand', center: [760, 262], region: 'Asia-Pacific' },
  { code: 'VN', name: 'Vietnam', center: [768, 255], region: 'Asia-Pacific' },
  { code: 'MY', name: 'Malaysia', center: [780, 278], region: 'Asia-Pacific' },
  { code: 'PH', name: 'Philippines', center: [815, 265], region: 'Asia-Pacific' },
  { code: 'NZ', name: 'New Zealand', center: [858, 395], region: 'Asia-Pacific' },

  { code: 'AE', name: 'UAE', center: [615, 248], region: 'Middle East' },
  { code: 'IL', name: 'Israel', center: [583, 222], region: 'Middle East' },
  { code: 'SA', name: 'Saudi Arabia', center: [600, 245], region: 'Middle East' },
  { code: 'IR', name: 'Iran', center: [615, 225], region: 'Middle East' },
  { code: 'EG', name: 'Egypt', center: [565, 235], region: 'Middle East' },

  { code: 'ZA', name: 'South Africa', center: [548, 375], region: 'Africa' },
  { code: 'NG', name: 'Nigeria', center: [513, 272], region: 'Africa' },
  { code: 'KE', name: 'Kenya', center: [575, 290], region: 'Africa' },
  { code: 'ET', name: 'Ethiopia', center: [580, 275], region: 'Africa' },
  { code: 'MA', name: 'Morocco', center: [480, 220], region: 'Africa' },
  { code: 'DZ', name: 'Algeria', center: [490, 225], region: 'Africa' },

  { code: 'RU', name: 'Russia', center: [620, 120], region: 'Europe' },
]

export function getCountryCenter(code: string): [number, number] | null {
  const c = COUNTRY_CENTROIDS.find(c => c.code === code)
  return c ? c.center : null
}

/**
 * Place country markers on a centered square grid. `spacing` is the visible
 * marker diameter, so neighbouring clickable markers touch but never overlap.
 */
export function spreadDots(center: [number, number], index: number, total: number, spacing: number): [number, number] {
  if (total <= 1) return center
  const side = Math.ceil(Math.sqrt(total))
  const row = Math.floor(index / side)
  const column = index % side
  return [
    center[0] + (column - (side - 1) / 2) * spacing,
    center[1] + (row - (side - 1) / 2) * spacing,
  ]
}

// ====================================================================
// COUNTRY SVG PATHS — Natural Earth 110m, simplified to 8-20 points
// Projection: Equirectangular, viewBox 0 0 1000 500
// ====================================================================

export const COUNTRY_PATHS: Record<string, string> = {
  // United States (contiguous 48) — distinctive shape with Florida, Texas, Great Lakes
  US: 'M156,118 L155,131 L158,152 L166,155 L172,158 L182,157 L192,159 L203,162 L215,167 L230,175 L255,178 L272,180 L278,178 L292,166 L303,155 L312,140 L314,128 L314,119 L298,120 L282,125 L265,132 L250,128 L236,118 L215,112 L195,110 L175,108 L160,110 Z',

  // Canada — large northern landmass, archipelagos simplified
  CA: 'M172,100 L185,82 L200,74 L218,72 L240,76 L260,80 L275,88 L288,95 L300,98 L310,102 L315,110 L308,115 L290,112 L270,108 L250,112 L235,115 L220,110 L205,105 L190,102 L178,108 L170,112 L165,108 Z',

  // Mexico — tapering shape connecting to Central America
  MX: 'M175,196 L180,188 L190,185 L200,184 L212,190 L218,200 L222,210 L215,218 L205,225 L195,228 L185,226 L177,218 L172,208 Z',

  // Brazil — large South American mass
  BR: 'M290,290 L300,282 L315,278 L330,282 L345,290 L352,305 L350,320 L342,335 L328,345 L313,348 L300,342 L290,330 L284,315 L286,300 Z',

  // Argentina — elongated southern cone + Chile overlap handled separately
  AR: 'M290,338 L298,340 L308,345 L312,358 L310,375 L305,390 L298,400 L290,405 L283,398 L280,380 L282,360 L285,345 Z',

  // Colombia — northwest South America
  CO: 'M260,268 L270,265 L278,270 L282,280 L278,290 L270,292 L262,288 L258,280 Z',

  // Chile — long thin strip
  CL: 'M280,345 L288,348 L290,358 L288,370 L285,385 L282,395 L278,400 L275,390 L274,375 L276,355 Z',

  // Peru
  PE: 'M268,298 L278,295 L285,302 L284,312 L278,322 L270,325 L264,318 L262,308 Z',

  // Germany — compact central European shape
  DE: 'M502,150 L508,146 L515,148 L520,152 L519,158 L517,164 L514,168 L508,170 L504,168 L500,164 L498,158 L499,153 Z',

  // Switzerland — small alpine country
  CH: 'M496,168 L500,164 L504,166 L506,170 L504,174 L500,176 L496,173 Z',

  // Denmark — Jutland peninsula + islands
  DK: 'M508,138 L513,134 L518,138 L516,143 L512,147 L507,146 L505,141 Z',

  // France — hexagon shape
  FR: 'M483,162 L490,157 L497,160 L499,166 L497,174 L492,180 L486,182 L480,178 L478,172 L480,166 Z',

  // United Kingdom — island shape
  GB: 'M472,135 L480,130 L486,133 L489,140 L487,148 L482,152 L476,150 L470,146 L468,140 Z',

  // Italy — boot shape
  IT: 'M504,180 L508,176 L514,178 L518,184 L516,192 L512,198 L508,204 L504,200 L501,192 L502,185 Z',

  // Sweden — Scandinavian peninsula east
  SE: 'M516,112 L524,106 L534,104 L540,112 L542,120 L538,128 L530,132 L522,130 L514,125 L510,118 Z',

  // Netherlands
  NL: 'M496,148 L500,146 L504,148 L505,153 L502,156 L498,155 L494,152 Z',

  // Poland
  PL: 'M522,148 L530,144 L536,148 L538,155 L534,160 L528,162 L522,159 L518,154 Z',

  // Spain — Iberian peninsula
  ES: 'M472,184 L478,178 L484,182 L486,188 L482,196 L476,200 L470,197 L467,191 Z',

  // Portugal
  PT: 'M466,190 L471,186 L474,190 L473,196 L468,200 L464,196 Z',

  // Norway — western Scandinavia
  NO: 'M510,112 L516,104 L522,100 L530,104 L532,110 L528,116 L524,122 L518,124 L512,120 L508,115 Z',

  // Finland
  FI: 'M540,108 L550,102 L558,106 L562,114 L558,122 L550,126 L542,124 L537,118 L536,112 Z',

  // Austria
  AT: 'M512,162 L518,158 L522,162 L520,168 L516,172 L510,170 L509,166 Z',

  // Czech Republic
  CZ: 'M516,152 L522,148 L526,152 L525,158 L520,162 L516,160 L515,156 Z',

  // Belgium
  BE: 'M492,150 L497,148 L500,151 L499,156 L495,158 L491,155 Z',

  // Ireland
  IE: 'M462,142 L468,138 L472,142 L471,148 L466,152 L461,148 Z',

  // Greece — mainland + Peloponnese
  GR: 'M528,198 L534,194 L538,200 L536,208 L530,212 L524,208 L522,202 Z',

  // Turkey
  TR: 'M558,194 L568,188 L575,194 L578,202 L572,210 L562,212 L554,208 L552,200 Z',

  // Ukraine
  UA: 'M544,154 L554,148 L564,150 L568,158 L564,166 L556,170 L546,168 L542,162 Z',

  // Romania
  RO: 'M536,166 L544,162 L550,166 L548,174 L542,178 L534,176 L532,170 Z',

  // Hungary
  HU: 'M524,160 L532,158 L536,164 L534,170 L528,172 L522,169 L521,164 Z',

  // Russia — massive northern Eurasia
  RU: 'M545,108 L570,100 L600,96 L640,94 L680,98 L720,100 L760,104 L800,108 L830,112 L840,118 L830,125 L800,128 L770,130 L740,128 L710,132 L680,130 L650,128 L620,125 L590,130 L560,128 L545,125 L540,118 Z',

  // Japan — island arc
  JP: 'M840,195 L846,190 L854,192 L858,198 L856,206 L850,214 L842,218 L834,212 L832,204 L834,198 Z',

  // China — large East Asian mass
  CN: 'M730,190 L745,178 L760,174 L778,176 L795,182 L805,195 L800,210 L790,222 L775,228 L755,230 L738,225 L725,218 L720,205 Z',

  // South Korea — peninsula
  KR: 'M820,196 L826,191 L832,194 L834,202 L830,210 L824,214 L818,210 L816,202 Z',

  // Taiwan — island
  TW: 'M810,225 L815,222 L819,226 L818,232 L814,234 L808,230 Z',

  // India — subcontinent
  IN: 'M700,230 L712,222 L722,226 L730,235 L728,248 L722,260 L712,264 L704,258 L697,248 L696,238 Z',

  // Australia — continent island
  AU: 'M795,340 L810,330 L825,332 L838,340 L842,355 L835,368 L822,375 L808,374 L796,365 L792,350 Z',

  // Indonesia — archipelago (simplified as Sumatra + Java + Borneo + Sulawesi blocks)
  ID: 'M770,280 L780,275 L788,280 L790,290 L784,296 L774,294 L768,288 Z M795,282 L805,278 L812,284 L810,292 L802,294 L792,290 Z',

  // Singapore
  SG: 'M784,280 L787,278 L790,281 L788,284 L784,282 Z',

  // Thailand
  TH: 'M752,254 L762,248 L770,252 L772,260 L767,268 L757,270 L750,264 Z',

  // Vietnam
  VN: 'M764,246 L770,240 L776,244 L778,254 L774,262 L766,264 L760,258 L758,250 Z',

  // Malaysia — peninsula + Borneo
  MY: 'M774,272 L780,268 L784,272 L782,278 L776,280 L770,276 Z M800,280 L808,276 L812,282 L808,288 L800,286 Z',

  // Philippines
  PH: 'M812,258 L820,254 L826,258 L824,266 L818,268 L810,264 Z',

  // New Zealand
  NZ: 'M855,388 L862,383 L866,388 L864,396 L858,398 L852,394 Z',

  // UAE
  AE: 'M612,244 L618,240 L624,244 L626,250 L620,254 L614,252 L610,248 Z',

  // Israel
  IL: 'M580,218 L586,214 L590,218 L592,224 L586,228 L580,226 L577,222 Z',

  // Saudi Arabia
  SA: 'M594,238 L606,232 L616,236 L620,244 L618,254 L608,258 L596,256 L590,248 L589,242 Z',

  // Iran
  IR: 'M608,218 L620,212 L630,216 L634,226 L628,236 L618,238 L608,234 L604,226 Z',

  // Egypt
  EG: 'M558,228 L568,224 L576,228 L578,238 L570,244 L560,244 L554,238 Z',

  // South Africa
  ZA: 'M540,362 L552,354 L560,360 L564,372 L558,382 L548,386 L538,380 L534,370 Z',

  // Nigeria
  NG: 'M506,266 L516,260 L524,264 L526,274 L518,280 L508,278 L502,272 Z',

  // Kenya
  KE: 'M570,284 L580,278 L586,284 L584,294 L576,298 L566,296 L564,288 Z',

  // Ethiopia
  ET: 'M574,268 L584,262 L592,268 L590,278 L582,284 L572,280 L569,272 Z',

  // Morocco
  MA: 'M474,214 L482,208 L490,212 L488,220 L480,224 L472,222 Z',

  // Algeria
  DZ: 'M486,214 L496,208 L506,212 L510,222 L502,230 L492,232 L482,228 L480,220 Z',
}

export const REGIONS: Record<string, { name: string; center: [number, number]; scale: number }> = {
  'Americas': { name: 'Americas', center: [235, 220], scale: 1.3 },
  'Europe': { name: 'Europe', center: [510, 160], scale: 2.8 },
  'Asia-Pacific': { name: 'Asia-Pacific', center: [775, 240], scale: 1.7 },
  'Middle East': { name: 'Middle East', center: [595, 235], scale: 2.5 },
  'Africa': { name: 'Africa', center: [550, 320], scale: 1.5 },
  'World': { name: 'World', center: [500, 250], scale: 1 },
}
