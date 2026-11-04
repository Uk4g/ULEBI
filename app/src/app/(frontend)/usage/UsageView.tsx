'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Download, Sliders } from 'lucide-react'
import { api } from '@/components/wardni/client'
import { useWard } from '@/components/wardni/WardProvider'
import { Button, Field, inputCls, Modal, Panel, cx } from '@/components/wardni/ui'
import type { ModelKey } from '@/lib/wardni/types'

type RangeKey = '24h' | '7d' | '3m'

export function UsageView() {
  const { snap, refresh, effectiveRole, pushToast } = useWard()
  const [range, setRange] = useState<RangeKey>('3m')
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [budgetModalOpen, setBudgetModalOpen] = useState(false)
  const [showSeries, setShowSeries] = useState({ current: true, previous: true, average: true })
  const [chartMetric, setChartMetric] = useState<'spend' | 'tokens' | 'requests'>('spend')

  const usage = snap?.usage
  const isAdmin = effectiveRole === 'admin'

  const series = useMemo(() => {
    if (!usage) return []
    if (range === '24h') return usage.series24h
    if (range === '7d') return usage.series7d
    return usage.series3m
  }, [usage, range])

  if (!snap || !usage) {
    return <div className="h-96 animate-pulse rounded-[12px] border border-line bg-panel" />
  }

  const exportCsv = () => {
    const headers = [
      'Model ID',
      'Model Label',
      'Input Tokens',
      'Output Tokens',
      'Total Tokens',
      'Requests',
      'Price per 1K Tokens ($)',
      'Cost Today ($)',
      'Cost This Shift ($)',
      'Cost This Month ($)',
    ]
    const rows = usage.models.map((m) => [
      m.modelId,
      `"${m.label}"`,
      m.inputTokens,
      m.outputTokens,
      m.totalTokens,
      m.requests,
      m.pricePer1kUsd.toFixed(4),
      m.costTodayUsd.toFixed(4),
      m.costShiftUsd.toFixed(4),
      m.costMonthUsd.toFixed(4),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ulebi-usage-costs-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    pushToast({ tone: 'ok', title: 'Exported Model Usage CSV' })
  }

  const maxVal = Math.max(
    1,
    ...series.map((p) =>
      chartMetric === 'spend'
        ? Math.max(p.currentUsd, p.previousUsd, p.averageUsd)
        : chartMetric === 'tokens'
          ? p.tokens
          : p.requests,
    ),
  )

  return (
    <div className="space-y-5">
      {/* Top Right Controls matching Reference 5 ("[ Customize ] [ 3 months ⌄ ]") */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => setCustomizeOpen(true)}>
          <Sliders className="h-3.5 w-3.5" /> Customize
        </Button>
        {isAdmin && (
          <Button size="sm" variant="secondary" onClick={() => setBudgetModalOpen(true)}>
            Budget Limit (${usage.budgetLimitUsd})
          </Button>
        )}
        <div className="flex rounded-lg border border-line bg-panel p-0.5 text-xs">
          {(
            [
              ['24h', '24h'],
              ['7d', '7 days'],
              ['3m', '3 months'],
            ] as [RangeKey, string][]
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setRange(k)}
              className={cx(
                'min-h-[28px] rounded-md px-2.5 py-1 font-medium transition',
                range === k ? 'bg-raised text-white' : 'text-slate-400 hover:text-white',
              )}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {usage.budgetWarning && (
        <div role="alert" className="flex items-center justify-between rounded-[12px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Monthly spend (${usage.totalCostMonthUsd.toFixed(4)}) has reached the budget alert threshold (${usage.budgetLimitUsd.toFixed(2)} limit).
            </span>
          </span>
        </div>
      )}

      {/* Main Spend Card (Reference 5 monochrome style) */}
      <section className="rounded-[12px] border border-line bg-panel p-6">
        <div className="text-xs text-slate-400">Spend</div>
        <div className="mt-1 font-display text-3xl font-normal tracking-tight text-white">
          ${usage.headlineSpendUsd.toFixed(2)}
        </div>

        {/* Monochrome Legend: Current / Previous / Average */}
        <div className="mt-3 flex flex-wrap items-center gap-5 text-xs text-slate-400">
          {showSeries.current && (
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 bg-white" /> Current
            </span>
          )}
          {showSeries.previous && (
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 bg-zinc-700" /> Previous
            </span>
          )}
          {showSeries.average && (
            <span className="inline-flex items-center gap-2">
              <span className="w-3 border-t border-dashed border-zinc-400" /> Average
            </span>
          )}
        </div>

        <div className="mt-6 h-64 w-full">
          <MonochromeSpendChart series={series} maxVal={maxVal} showSeries={showSeries} metric={chartMetric} />
        </div>
      </section>

      {/* Two Lower 50%-Width Panels matching Reference 5 ("Average Daily Spend" & "Average Monthly Spend") */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className="rounded-[12px] border border-line bg-panel p-6">
          <div className="text-xs text-slate-400">Average Daily Spend</div>
          <div className="mt-1 font-display text-2xl font-normal text-white">${usage.avgDailySpendUsd.toFixed(2)}</div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 bg-white" /> Daily
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 border-t border-dashed border-zinc-500" /> Average
            </span>
          </div>
        </section>

        <section className="rounded-[12px] border border-line bg-panel p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-slate-400">Average Monthly Spend</div>
              <div className="mt-1 font-display text-2xl font-normal text-white">${usage.avgMonthlySpendUsd.toFixed(2)}</div>
            </div>
            <div className="text-right font-mono text-[11px] text-slate-500">
              Budget Limit: ${usage.budgetLimitUsd.toFixed(2)}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-400" /> Total ({usage.totalCallsMonth} calls)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span>{usage.totalTokensMonth.toLocaleString()} tokens</span>
            </span>
          </div>
        </section>
      </div>

      {/* Model Tokens & Pricing Table + Stacked Bar Chart */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <Panel
          title="Model Tokens & Pricing"
          className="xl:col-span-8"
          actions={
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" /> CSV export
            </Button>
          }
          bodyClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line text-[11px] font-medium text-slate-400">
                  <th className="px-4 py-3">Model</th>
                  <th className="px-3 py-3 text-right">Input tokens</th>
                  <th className="px-3 py-3 text-right">Output tokens</th>
                  <th className="px-3 py-3 text-right">Requests</th>
                  <th className="px-3 py-3 text-right">Price / 1K</th>
                  <th className="px-3 py-3 text-right">Cost today</th>
                  <th className="px-3 py-3 text-right">Cost this shift</th>
                  <th className="px-4 py-3 text-right">Cost this month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-mono text-[11px]">
                {usage.models.map((m) => (
                  <tr key={m.key} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-sans">
                      <div className="font-medium text-white">{m.label}</div>
                      <div className="font-mono text-[10px] text-slate-500">{m.modelId}</div>
                    </td>
                    <td className="px-3 py-3 text-right text-slate-300">{m.inputTokens.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-slate-300">{m.outputTokens.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-slate-300">{m.requests.toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-slate-400">${m.pricePer1kUsd.toFixed(3)}</td>
                    <td className="px-3 py-3 text-right text-slate-300">${m.costTodayUsd.toFixed(4)}</td>
                    <td className="px-3 py-3 text-right text-slate-300">${m.costShiftUsd.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white">${m.costMonthUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Cost per Model" className="xl:col-span-4">
          <MonochromeStackedBar models={usage.models} />
        </Panel>
      </div>

      {/* Customize Modal */}
      <Modal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title="Customize Chart"
        footer={<Button variant="primary" onClick={() => setCustomizeOpen(false)}>Done</Button>}
      >
        <div className="space-y-3">
          <Field label="Metric">
            <select className={inputCls} value={chartMetric} onChange={(e) => setChartMetric(e.target.value as 'spend' | 'tokens' | 'requests')}>
              <option value="spend">Spend ($ USD)</option>
              <option value="tokens">Tokens</option>
              <option value="requests">Requests</option>
            </select>
          </Field>
          <div className="space-y-2 rounded-lg border border-line bg-well p-3 text-xs">
            {(['current', 'previous', 'average'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={showSeries[k]}
                  onChange={(e) => setShowSeries({ ...showSeries, [k]: e.target.checked })}
                />
                <span className="capitalize">{k}</span>
              </label>
            ))}
          </div>
        </div>
      </Modal>

      <BudgetLimitModal
        open={budgetModalOpen}
        onClose={() => setBudgetModalOpen(false)}
        currentLimit={usage.budgetLimitUsd}
        currentThreshold={usage.budgetAlertThresholdPct}
        onSaved={async () => {
          await refresh()
          pushToast({ tone: 'ok', title: 'Budget limit updated' })
        }}
      />
    </div>
  )
}

/** Monochrome dotted-grid chart matching Reference 5 */
function MonochromeSpendChart({
  series,
  maxVal,
  showSeries,
  metric,
}: {
  series: { label: string; currentUsd: number; previousUsd: number; averageUsd: number; tokens: number; requests: number }[]
  maxVal: number
  showSeries: { current: boolean; previous: boolean; average: boolean }
  metric: 'spend' | 'tokens' | 'requests'
}) {
  if (!series.length) return null
  const w = 800
  const h = 210
  const padL = 36
  const padR = 16
  const padT = 16
  const padB = 26
  const innerW = w - padL - padR
  const innerH = h - padT - padB

  const valOf = (p: (typeof series)[number], key: 'current' | 'previous' | 'average') => {
    if (metric === 'tokens') return key === 'current' ? p.tokens : 0
    if (metric === 'requests') return key === 'current' ? p.requests : 0
    return key === 'current' ? p.currentUsd : key === 'previous' ? p.previousUsd : p.averageUsd
  }

  const avgY = padT + innerH * 0.72

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full overflow-visible" role="img" aria-label="Spend chart">
      {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => {
        const y = padT + innerH * (1 - r)
        const labelVal = (maxVal * r).toFixed(metric === 'spend' ? 0 : 0)
        return (
          <g key={idx}>
            <text x={0} y={y + 4} fill="#52525b" fontSize="10" fontFamily="JetBrains Mono, monospace">
              {labelVal}
            </text>
            <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="#232329" strokeDasharray="2 3" />
          </g>
        )
      })}

      {/* Vertical grid lines + X labels */}
      {series.map((p, i) => {
        const x = padL + ((i + 0.5) / series.length) * innerW
        const currVal = valOf(p, 'current')
        const prevVal = valOf(p, 'previous')
        const barH = Math.max(0, (currVal / maxVal) * innerH)
        const prevH = Math.max(0, (prevVal / maxVal) * innerH)
        const barW = Math.min(48, (innerW / series.length) * 0.5)
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={padT} y2={padT + innerH} stroke="#1c1c21" strokeDasharray="2 3" />
            {showSeries.previous && prevH > 0 && (
              <rect x={x - barW / 2 - 6} y={padT + innerH - prevH} width={barW} height={prevH} fill="#3f3f46" />
            )}
            {showSeries.current && barH > 0 && (
              <rect x={x - barW / 2} y={padT + innerH - barH} width={barW} height={barH} fill="#ffffff" />
            )}
            {i % 2 === 0 && (
              <text x={x} y={h - 6} textAnchor="middle" fill="#71717a" fontSize="10" fontFamily="Inter, sans-serif">
                {p.label}
              </text>
            )}
          </g>
        )
      })}

      {showSeries.average && (
        <line x1={padL} x2={w - padR} y1={avgY} y2={avgY} stroke="#71717a" strokeWidth="1.2" strokeDasharray="4 4" />
      )}
    </svg>
  )
}

function MonochromeStackedBar({ models }: { models: { key: ModelKey; label: string; costMonthUsd: number; requests: number }[] }) {
  const shades: Record<ModelKey, string> = {
    voice: 'bg-zinc-600',
    sam: 'bg-zinc-400',
    wonder: 'bg-white',
    spark: 'bg-zinc-500',
  }
  const totalCost = models.reduce((s, m) => s + m.costMonthUsd, 0)

  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full overflow-hidden rounded bg-well">
        {totalCost > 0 ? (
          models.map((m) => (
            <div
              key={m.key}
              style={{ width: `${Math.max(5, (m.costMonthUsd / totalCost) * 100)}%` }}
              className={shades[m.key]}
            />
          ))
        ) : (
          <div className="h-full w-full bg-zinc-800" />
        )}
      </div>
      <div className="space-y-2">
        {models.map((m) => (
          <div key={m.key} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-slate-300">
              <span className={cx('h-2.5 w-2.5', shades[m.key])} />
              {m.label}
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              {m.requests} req · ${m.costMonthUsd.toFixed(4)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BudgetLimitModal({
  open,
  onClose,
  currentLimit,
  currentThreshold,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  currentLimit: number
  currentThreshold: number
  onSaved: () => Promise<void>
}) {
  const [limit, setLimit] = useState(String(currentLimit))
  const [threshold, setThreshold] = useState(String(currentThreshold))
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      await api('/ward-api/settings', {
        body: {
          budgetLimitUsd: Number(limit) || 250,
          budgetAlertThresholdPct: Number(threshold) || 80,
        },
      })
      await onSaved()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Budget Limit"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Monthly Budget Limit ($ USD)">
          <input className={inputCls} type="number" step="1" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <Field label="Alert Threshold (%)">
          <input className={inputCls} type="number" min="10" max="100" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
