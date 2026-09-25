'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  COUNTRY_CENTROIDS,
  REGIONS,
  getCountryCenter,
  spreadDots,
} from './world-map-data'

interface Company {
  id: string
  name: string
  country_code: string | null
  robots: number
  url: string
}

interface Props {
  companies: Company[]
  countryCount: number
  totalCompanies: number
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', DE: 'Germany', JP: 'Japan', CH: 'Switzerland',
  DK: 'Denmark', CN: 'China', KR: 'South Korea', FR: 'France',
  GB: 'United Kingdom', IT: 'Italy', SE: 'Sweden', NL: 'Netherlands',
  PL: 'Poland', IN: 'India', BR: 'Brazil', CA: 'Canada', MX: 'Mexico',
  ES: 'Spain', AU: 'Australia', AE: 'UAE', IL: 'Israel', ZA: 'South Africa',
  SG: 'Singapore', TW: 'Taiwan', SA: 'Saudi Arabia',
}

const DOT_COLOR = '#7b8cff'
const DOT_GLOW = 'rgba(82,102,235,0.40)'
const DOT_RADIUS = 5.5
const DOT_STROKE_WIDTH = 2.5
const DOT_DIAMETER = DOT_RADIUS * 2 + DOT_STROKE_WIDTH

export default function IntegratorsMap({ companies, countryCount, totalCompanies }: Props) {
  const [selectedCountry, setSelectedCountry] = useState<string>('')
  const [tooltip, setTooltip] = useState<{ x: number; y: number; company: Company } | null>(null)
  const [viewBox, setViewBox] = useState('0 0 1000 500')
  const svgRef = useRef<SVGSVGElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  // Group companies by country
  const byCountry: Record<string, Company[]> = {}
  for (const c of companies) {
    const cc = c.country_code
    if (!cc || !getCountryCenter(cc)) continue
    if (!byCountry[cc]) byCountry[cc] = []
    byCountry[cc].push(c)
  }

  const countriesWithData = Object.keys(byCountry)
  const filteredCountries = selectedCountry
    ? [selectedCountry]
    : countriesWithData

  const handleCountryFilter = useCallback((code: string) => {
    setSelectedCountry(code)
    setTooltip(null)
    if (code) {
      const country = COUNTRY_CENTROIDS.find(c => c.code === code)
      if (country) {
        const region = REGIONS[country.region]
        if (region) {
          const s = region.scale
          const w = 1000 / s
          const h = 500 / s
          const x = region.center[0] - w / 2
          const y = region.center[1] - h / 2
          setViewBox(`${x} ${y} ${w} ${h}`)
        }
      }
    } else {
      setViewBox('0 0 1000 500')
    }
  }, [])

  const allCountries = companies
    .filter(c => c.country_code && getCountryCenter(c.country_code))
  const displayedCountries = selectedCountry
    ? allCountries.filter(c => c.country_code === selectedCountry)
    : allCountries

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-6 items-center">
        <select value={selectedCountry} onChange={e => handleCountryFilter(e.target.value)}
          className="text-[13px] py-2.5 px-3 rounded-md border outline-none cursor-pointer min-w-[170px]"
          style={{ background: 'var(--color-input-bg)', borderColor: 'var(--color-input-border)', color: 'var(--color-text-body)' }}>
          <option value="">All Countries ({countriesWithData.length})</option>
          {countriesWithData.map(cc => (
            <option key={cc} value={cc}>{COUNTRY_NAMES[cc] || cc} ({byCountry[cc].length})</option>
          ))}
        </select>
        {selectedCountry && (
          <button onClick={() => handleCountryFilter('')}
            className="text-[13px] py-2.5 px-4 rounded-md border cursor-pointer transition-colors hover:border-[var(--color-border-strong)]"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border-color)', background: 'transparent' }}>
            ✕ Reset View
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--color-text-dim)' }}>
          {totalCompanies} companies · {countryCount} countries
        </span>
      </div>

      {/* Map + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 min-h-[500px]">
        {/* MAP — SVG with image + dot overlay */}
        <div ref={mapRef}
          className="rounded-xl border overflow-hidden relative"
          style={{ borderColor: 'var(--color-border-color)', background: 'var(--color-bg-card)' }}>

          <svg
            ref={svgRef}
            viewBox={viewBox}
            className="w-full h-full transition-all duration-700 ease-out"
            preserveAspectRatio="xMidYMid meet"
            style={{ minHeight: 420 }}
          >
            {/* World map image — zooms with viewBox */}
            <image href="/world-map.png" x="0" y="0" width="1000" height="500"
              preserveAspectRatio="xMidYMid slice" />

            {/* Selected country highlight ring */}
            {selectedCountry && (() => {
              const center = getCountryCenter(selectedCountry)
              if (!center) return null
              return (
                <circle cx={center[0]} cy={center[1]} r="28"
                  fill="none" stroke={DOT_COLOR} strokeWidth="1.2"
                  strokeDasharray="5 4" opacity="0.6">
                  <animate attributeName="r" values="28;34;28" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
                </circle>
              )
            })()}

            {/* Dots */}
            {filteredCountries.map(cc => {
              const countryCompanies = byCountry[cc]
              const center = getCountryCenter(cc)!
              return countryCompanies.map((comp, i) => {
                const [cx, cy] = spreadDots(center, i, countryCompanies.length, DOT_DIAMETER)
                return (
                  <g key={comp.id} className="cursor-pointer">
                    <circle cx={cx} cy={cy} r="14" fill={DOT_GLOW}
                      pointerEvents="none"
                      className="transition-opacity duration-200 hover:opacity-100 opacity-50" />
                    <circle cx={cx} cy={cy} r={DOT_RADIUS}
                      fill={DOT_COLOR}
                      stroke="#090d14" strokeWidth={DOT_STROKE_WIDTH}
                      onMouseEnter={() => {
                        const svgRect = svgRef.current?.getBoundingClientRect()
                        if (svgRect) {
                          const vbx = parseFloat(viewBox.split(' ')[0]) || 0
                          const vby = parseFloat(viewBox.split(' ')[1]) || 0
                          const vbw = parseFloat(viewBox.split(' ')[2]) || 1000
                          const vbh = parseFloat(viewBox.split(' ')[3]) || 500
                          const scaleX = svgRect.width / vbw
                          const scaleY = svgRect.height / vbh
                          setTooltip({
                            x: (cx - vbx) * scaleX + 18,
                            y: (cy - vby) * scaleY - 12,
                            company: comp,
                          })
                        }
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={() => window.location.href = comp.url}
                    />
                    {i === 0 && !selectedCountry && (
                      <text x={cx + 10} y={cy - 10} fontSize="9" fill="#e0e4ea" fontFamily="system-ui, sans-serif" fontWeight="600"
                        pointerEvents="none"
                        style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                        {cc}
                      </text>
                    )}
                  </g>
                )
              })
            })}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute z-50 pointer-events-none"
              style={{
                left: Math.min(Math.max(tooltip.x, 4), 280),
                top: Math.min(Math.max(tooltip.y, 4), 380),
              }}>
              <div className="rounded-lg p-3 border text-xs"
                style={{ background: '#161718', borderColor: '#383b3f', minWidth: 160, boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>
                <div className="font-medium text-sm" style={{ color: '#fff' }}>{tooltip.company.name}</div>
                <div className="mt-1" style={{ color: '#8a8f98' }}>
                  {tooltip.company.country_code ? (COUNTRY_NAMES[tooltip.company.country_code] || tooltip.company.country_code) : '—'}
                </div>
                <div className="mt-1" style={{ color: '#62666d' }}>{tooltip.company.robots} robots</div>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-3 left-3 flex gap-4 text-[11px] px-3 py-1.5 rounded-md border"
            style={{ color: '#8a8f98', background: 'rgba(15,16,17,0.9)', borderColor: '#23252a' }}>
            <span>
              <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                style={{ background: DOT_COLOR, boxShadow: '0 0 8px rgba(82,102,235,0.6)' }} />
              Company HQ
            </span>
            <span>{countriesWithData.length} countries</span>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="flex flex-col gap-2 overflow-y-auto max-h-[504px]">
          {displayedCountries.length === 0 && (
            <div className="text-sm py-8 text-center" style={{ color: 'var(--color-text-dim)' }}>No companies with location data</div>
          )}
          {displayedCountries.map(comp => (
            <Link key={comp.id} href={comp.url}
              onMouseEnter={() => {
                const cc = comp.country_code
                if (cc && getCountryCenter(cc)) {
                  const center = getCountryCenter(cc)!
                  setSelectedCountry(cc)
                  const country = COUNTRY_CENTROIDS.find(c => c.code === cc)
                  if (country) {
                    const region = REGIONS[country.region]
                    if (region) {
                      const s = region.scale
                      const w = 1000 / s
                      const h = 500 / s
                      const x = region.center[0] - w / 2
                      const y = region.center[1] - h / 2
                      setViewBox(`${x} ${y} ${w} ${h}`)
                    }
                  }
                }
              }}
              onMouseLeave={() => {
                setSelectedCountry('')
                setViewBox('0 0 1000 500')
              }}
              className="block rounded-xl p-4 border transition-colors hover:bg-[var(--color-bg-elevated)] flex-shrink-0"
              style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)', borderColor: 'var(--color-border-color)' }}>
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: DOT_COLOR, boxShadow: '0 0 6px rgba(82,102,235,0.5)' }} />
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--color-text-heading)' }}>{comp.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {comp.country_code ? COUNTRY_NAMES[comp.country_code] || comp.country_code : '—'}
                    <span className="ml-2" style={{ color: 'var(--color-text-dim)' }}>{comp.robots} robot{comp.robots !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
