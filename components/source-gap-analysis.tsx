import Image from 'next/image'
import type { ClusterAnalysis, DomainEntry, SourceGapResult } from '@/lib/analysis/source-gaps'

interface Props {
  result: SourceGapResult
  companyName: string
}

export function SourceGapAnalysis({ result, companyName }: Props) {
  if (!result.hasAnyData) return null

  const activeClusters = result.clusters.filter((c) => c.hasData)

  return (
    <div className="space-y-4">
      {activeClusters.map((cluster) => (
        <ClusterPanel key={cluster.cluster.key} cluster={cluster} companyName={companyName} />
      ))}
    </div>
  )
}

function ClusterPanel({ cluster, companyName }: { cluster: ClusterAnalysis; companyName: string }) {
  return (
    <div className="border border-[#E5E2DC] rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E2DC] bg-[#F9F8F6]">
        <span className="text-sm font-medium text-[#1A1A1A]">{cluster.cluster.label}</span>
        <div className="flex items-center gap-2">
          {cluster.gapCount > 0 ? (
            <span className="text-[11px] font-mono bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] px-2 py-0.5 rounded-full">
              {cluster.gapCount} gap{cluster.gapCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-[11px] font-mono bg-[#D1FAE5] text-[#065F46] border border-[#A7F3D0] px-2 py-0.5 rounded-full">
              no gaps
            </span>
          )}
          <span className="text-[11px] text-[#6C6C6C] font-mono">
            {cluster.domains.length} source{cluster.domains.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Insufficient data notice */}
      {cluster.totalProbes < 2 && (
        <div className="px-4 py-3 text-xs text-[#6C6C6C] bg-[#F9F8F6] border-b border-[#E5E2DC]">
          Need more probes with citations for reliable gap detection.
        </div>
      )}

      {/* Domain rows */}
      {cluster.domains.length > 0 ? (
        <div className="divide-y divide-[#F0EEE9]">
          {cluster.domains.map((entry) => (
            <DomainRow key={entry.domain} entry={entry} companyName={companyName} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-4 text-xs text-[#6C6C6C]">No citation data for this cluster.</div>
      )}

      {/* No-gap confirmation */}
      {cluster.gapCount === 0 && cluster.domains.length > 0 && cluster.totalProbes >= 2 && (
        <div className="px-4 py-2.5 border-t border-[#E5E2DC] bg-[#F0FDF4] text-[11px] text-[#065F46]">
          {companyName} appears across all frequently cited sources in this cluster.
        </div>
      )}
    </div>
  )
}

function DomainRow({ entry, companyName }: { entry: DomainEntry; companyName: string }) {
  const visibleCompetitors = entry.competitorsMentioned.slice(0, 3)
  const extraCount = entry.competitorsMentioned.length - visibleCompetitors.length

  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-2.5 text-xs',
        entry.isGap
          ? 'border-l-2 border-l-[#CEAC01] bg-[#FFFDF0] pl-3'
          : '',
      ].join(' ')}
    >
      {/* Favicon */}
      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
        <Image
          src={`https://www.google.com/s2/favicons?domain=${entry.domain}&sz=16`}
          alt=""
          width={16}
          height={16}
          className="rounded-sm"
          unoptimized
        />
      </div>

      {/* Domain name */}
      <span className="font-mono text-[11px] text-[#1A1A1A] truncate w-36 shrink-0">
        {entry.domain}
      </span>

      {/* Citation frequency bar */}
      <div className="w-16 shrink-0 h-1.5 bg-[#E5E2DC] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#B8B4AD] rounded-full"
          style={{ width: `${Math.round(entry.citationRate * 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-[#6C6C6C] font-mono shrink-0 w-12">
        {entry.citedInProbeCount}/{entry.totalProbesInCluster}
      </span>

      {/* Brand presence */}
      <div className="flex items-center gap-1 shrink-0 w-24">
        <span
          className={[
            'w-1.5 h-1.5 rounded-full shrink-0',
            entry.brandMentionedCount > 0 ? 'bg-[#22C55E]' : 'bg-[#CEAC01]',
          ].join(' ')}
        />
        <span
          className={[
            'text-[10px] font-mono',
            entry.brandMentionedCount > 0 ? 'text-[#15803D]' : 'text-[#92400E]',
          ].join(' ')}
        >
          {entry.brandMentionedCount > 0 ? companyName : 'Not present'}
        </span>
      </div>

      {/* Competitor pills */}
      <div className="flex items-center gap-1 flex-wrap min-w-0">
        {visibleCompetitors.map((comp) => (
          <span
            key={comp}
            className="text-[10px] font-mono bg-[#F3F2EF] text-[#6C6C6C] px-1.5 py-0.5 rounded shrink-0"
          >
            {comp}
          </span>
        ))}
        {extraCount > 0 && (
          <span className="text-[10px] text-[#6C6C6C] font-mono shrink-0">+{extraCount}</span>
        )}
      </div>
    </div>
  )
}
