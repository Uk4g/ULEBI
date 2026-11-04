'use client'

import { useRouter } from 'next/navigation'
import { Plus, KeyRound, Users, Video, BookOpen, Sparkles } from 'lucide-react'
import { api } from '@/components/wardni/client'
import { useWard } from '@/components/wardni/WardProvider'
import { Button } from '@/components/wardni/ui'

export function GuideView() {
  const { snap, refresh, setApiModalOpen, pushToast } = useWard()
  const router = useRouter()

  const quickAddNurse = async () => {
    const names = ['Nurse Karim', 'Nurse Lina', 'Nurse Yacine', 'Nurse Amina']
    const count = snap?.nurses?.length || 0
    const nextName = names[count % names.length]
    try {
      await api('/ward-api/nurses', {
        body: { name: nextName, role: count === 0 ? 'Charge RN' : 'Ward RN', onDuty: true },
      })
      await refresh()
      pushToast({ tone: 'ok', title: `Added ${nextName} to Shift Roster` })
    } catch (e) {
      pushToast({ tone: 'err', title: 'Could not add nurse', detail: (e as Error).message })
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
            HOSPITAL SETUP &amp; ARCHITECTURE MANUAL
          </div>
          <h2 className="mt-1 font-serif text-4xl font-normal tracking-tight text-white">
            How to Use ULEBI
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Autonomous AI Clinical Night-Shift Triage &amp; Nurse Dispatch Agent powered by Meta's 4-Model Pipeline.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => router.push('/dashboard')}>
            <Plus className="h-3.5 w-3.5" /> Add Patient Room
          </Button>
          <Button variant="secondary" size="sm" onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </section>

      {/* Clinical Motivation Banner */}
      <div className="rounded-xl border border-line bg-panel p-5 space-y-2.5 text-xs">
        <div className="flex items-center gap-2 font-bold text-white text-sm">
          <span className="text-sky-400 font-mono">🏥</span>
          <span>Clinical Origin: Protecting Patients &amp; Night-Shift Nurses</span>
        </div>
        <p className="text-slate-300 leading-relaxed">
          In hospital wards worldwide, night shifts are where patient care breaks down. Prolonged night shifts cause severe physical exhaustion, cognitive fatigue, and documented elevated risks of cardiovascular events and heart attacks among nursing staff. When a single nurse is left monitoring 20–30 rooms alone, patients deteriorate or suffer falls in the dark without assistance. <strong>ULEBI compresses the surveillance workload of 10 staff members into 1 coordinated screen</strong> and pages the specific on-duty nurse assigned to that patient immediately.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Step 1 */}
        <article className="rounded-[12px] border border-line bg-panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-sky-400">STEP 1 · META MODEL API CREDITS</span>
            <Button variant="primary" size="sm" onClick={() => setApiModalOpen(true)}>
              <KeyRound className="h-3.5 w-3.5" /> Connect API Key
            </Button>
          </div>
          <h3 className="text-sm font-semibold text-white">1. Get Credits &amp; API Key from Meta Developer Portal</h3>
          <p className="text-xs leading-relaxed text-slate-300">
            Before deploying ULEBI, visit the <a href="https://dev.meta.ai/" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline">Meta Model API Developer Portal</a>, sign in, acquire API credits, and generate your Bearer token (<code>MODEL_API_KEY</code>). Enter it in <strong>Meta API Keys</strong> to connect all 4 models live.
          </p>
        </article>

        {/* Step 2 */}
        <article className="rounded-[12px] border border-line bg-panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-purple-400">STEP 2 · HARDWARE SETUP</span>
            <span className="font-mono text-[10px] text-slate-400">IR CAMS + BEDSIDE PADS</span>
          </div>
          <h3 className="text-sm font-semibold text-white">2. Install Room IR Night Cameras &amp; Bedside Tablets</h3>
          <p className="text-xs leading-relaxed text-slate-300">
            Every patient room requires an <strong>Infrared (IR) Night Camera (850nm/940nm LEDs) with an integrated microphone</strong> so computer vision and speech recognition run 24/7 in dark patient rooms. At bedside, mount a tablet opening the room's secret pad link for tactile patient buttons (<code>EMERGENCY HELP</code>, <code>BATHROOM ASSIST / WC</code>, <code>PAIN / COMFORT</code>, <code>WATER</code>, <code>DRINK</code>, <code>EAT</code>).
          </p>
        </article>

        {/* Step 3 */}
        <article className="rounded-[12px] border border-line bg-panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-emerald-400">STEP 3 · META 4-MODEL CHAIN</span>
            <Button variant="secondary" size="sm" onClick={() => router.push('/vision')}>
              <Video className="h-3.5 w-3.5" /> Open Vision
            </Button>
          </div>
          <h3 className="text-sm font-semibold text-white">3. Sequential Model Pipeline: Output → Next Input</h3>
          <p className="text-xs leading-relaxed text-slate-300">
            Meta's models work in harmony: <strong>SAM 3.1</strong> outputs spatial telemetry JSON → <strong>Muse Wonder 1.0</strong> evaluates movement &amp; posture (gated reasoning) → <strong>Muse Spark 1.3</strong> synthesizes visual facts with bedside audio from <strong>Muse Voice Transcribe 1.0</strong> and patient clinical risk profiles to assign triage urgency (RED, YELLOW, routine).
          </p>
        </article>

        {/* Step 4 */}
        <article className="rounded-[12px] border border-line bg-panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-amber-400">STEP 4 · SAM 3.1 PROMPTING SUITE</span>
            <span className="font-mono text-[10px] text-slate-400">TEXT · SPATIAL · EXEMPLAR</span>
          </div>
          <h3 className="text-sm font-semibold text-white">4. Three Distinct SAM 3.1 Prompting Modes</h3>
          <p className="text-xs leading-relaxed text-slate-300">
            In <strong>Vision Tracking</strong>, select between: <strong>Text Prompt</strong> (zero-shot class descriptions + negative exclusions), <strong>Visual (Spatial) Prompt</strong> (Frame-0 <code>&lt;0f&gt;</code> token format with bed coordinates <code>&lt;|box;...|&gt;</code> for patient origin lock), and <strong>Exemplar Prompt</strong> (reference crops of gowns or IV poles resolved into noun phrases by Spark 1.3).
          </p>
        </article>

        {/* Step 5 */}
        <article className="rounded-[12px] border border-line bg-panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-rose-400">STEP 5 · PROACTIVE DISPATCH</span>
            <Button variant="secondary" size="sm" onClick={quickAddNurse}>
              <Users className="h-3.5 w-3.5" /> + Quick Add Nurse
            </Button>
          </div>
          <h3 className="text-sm font-semibold text-white">5. Shift Roster &amp; Direct Nurse Call Chain</h3>
          <p className="text-xs leading-relaxed text-slate-300">
            Add on-duty nurses in the <strong>Shift Roster</strong>. When an acute event or bed departure occurs, ULEBI pages the assigned/closest on-duty nurse with a live countdown timer. If unanswered, it automatically steps to the next nurse in the call order.
          </p>
        </article>

        {/* Step 6 */}
        <article className="rounded-[12px] border border-line bg-panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-sky-400">STEP 6 · SAFETY &amp; HANDOFF</span>
            <Button variant="primary" size="sm" onClick={() => router.push('/dashboard')}>
              <Sparkles className="h-3.5 w-3.5" /> Dashboard Directive
            </Button>
          </div>
          <h3 className="text-sm font-semibold text-white">6. Deterministic Safety Floor &amp; Shift Synthesis</h3>
          <p className="text-xs leading-relaxed text-slate-300">
            Patient safety never waits on AI: deterministic rules immediately triage emergency pull cords, fall-risk movements, and distress keywords. Meta models can only raise or enrich verdicts, never lower the floor. Click <strong>Synthesize Shift</strong> or <strong>Morning Handoff</strong> for Spark 1.3 to compile ward-wide physician summaries.
          </p>
        </article>
      </div>
    </div>
  )
}
