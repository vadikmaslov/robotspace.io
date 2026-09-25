export const dynamic = 'force-dynamic'

export default function AdminSettingsPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-heading)' }}>Settings</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Email Recipients</h2>
        <div className="p-4 rounded-xl" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-dim)' }}>Notification Email</div>
          <div className="text-sm font-mono" style={{ color: 'var(--color-text-body)' }}>vadikmaslov@gmail.com</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-dim)' }}>Quote Request Email</div>
          <div className="text-sm font-mono" style={{ color: 'var(--color-text-body)' }}>vadikmaslov@gmail.com</div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Confidence Thresholds</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            ['Identity', '85%'], ['Technical Spec', '90%'], ['Compatibility', '90%'],
            ['News Metadata', '80%'], ['Trend Statement', '90%'], ['Conflict Margin', '10%'],
          ].map(([label, value]) => (
            <div key={label} className="p-4 rounded-xl" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
              <div className="text-xs" style={{ color: 'var(--color-text-dim)' }}>{label}</div>
              <div className="text-lg font-mono font-medium" style={{ color: 'var(--color-text-heading)' }}>{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium" style={{ color: 'var(--color-text-heading)' }}>Image Publication</h2>
        <div className="p-4 rounded-xl flex items-center justify-between" style={{ background: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}>
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text-body)' }}>Normal Mode</div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-dim)' }}>ALLOWED, UNKNOWN, and RESTRICTED images displayed</div>
          </div>
        </div>
      </section>
    </div>
  )
}
