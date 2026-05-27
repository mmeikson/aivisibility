const CX = 100
const CY = 100
const R = 76
const STROKE = 16
const NEEDLE_LEN = 60

function pt(angleDeg: number, r = R) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) }
}

// Score 20 → 180° (left end), score 100 → 0° (right end). Scores below 20 pin to left.
function scoreAngle(score: number) {
  return 180 - (Math.max(20, score) - 20) * (180 / 80)
}

// Top semicircle: sweep-flag=1 (clockwise in SVG y-down space = goes through top)
const start = pt(180)
const end = pt(0)
const ARC = `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`

function label(score: number) {
  if (score >= 80) return 'Healthy'
  if (score >= 60) return 'Moderate'
  if (score >= 40) return 'Weak'
  return 'Critical'
}

function labelColor(score: number) {
  if (score >= 80) return '#16a34a'
  if (score >= 60) return '#8fa83d'
  if (score >= 40) return '#CEAC01'
  return '#b91c1c'
}

export function VisibilityGauge({ score }: { score: number }) {
  const angle = scoreAngle(Math.min(100, score))
  const tip = pt(angle, NEEDLE_LEN)

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[11px] font-mono text-[#ABABAB] uppercase tracking-widest">
        Overall Visibility
      </span>
      <svg viewBox="0 0 200 125" width="200" height="125">
        <defs>
          {/*
            Equal arc-length quartiles don't map to equal x-offsets on a semicircle.
            A point at angle θ has x = CX + R·cos(θ), so the x-positions of the
            quartile boundaries (θ = 135°, 90°, 45°) are at gradient offsets
            ≈14.6%, 50%, 85.4% — not 25/50/75%. Centering each pure color in its
            section (at 7.3%, 32.3%, 67.7%, 92.7%) gives visually equal sections
            with smooth gradients between them.
          */}
          <linearGradient id="gauge-grad" x1={start.x} y1="0" x2={end.x} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#cc0000" />
            <stop offset="20%"  stopColor="#D69900" />
            <stop offset="80%"  stopColor="#52A300" />
            <stop offset="100%" stopColor="#007041" />
          </linearGradient>
        </defs>

        {/* Track */}
        <path d={ARC} fill="none" stroke="#E5E2DC" strokeWidth={STROKE} strokeLinecap="round" />

        {/* Colored arc */}
        <path d={ARC} fill="none" stroke="url(#gauge-grad)" strokeWidth={STROKE} strokeLinecap="round" />

        {/* Needle */}
        <line
          x1={CX} y1={CY}
          x2={tip.x.toFixed(1)} y2={tip.y.toFixed(1)}
          stroke="#141414"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r="4" fill="#141414" />

        {/* Descriptor */}
        <text
          x={CX} y={CY + 18}
          textAnchor="middle"
          fill={labelColor(score)}
          fontSize="14"
          fontWeight="600"
          fontFamily="var(--font-geist-mono, monospace)"
          letterSpacing="0.5"
        >
          {label(score)}
        </text>
      </svg>
    </div>
  )
}
