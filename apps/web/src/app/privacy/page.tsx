export async function generateMetadata() {
  return { title: 'Privacy Policy', description: 'How RobotSpace.io handles personal data — minimal collection, no tracking, no third-party analytics.' }
}

export default function PrivacyPage() {
  return (
    <div className="max-w-[760px] mx-auto px-6 py-12" style={{ color: 'var(--color-text-body)' }}>
      <h1 className="text-3xl font-semibold mb-6" style={{ color: 'var(--color-text-heading)' }}>Privacy Policy</h1>
      <div className="prose prose-sm space-y-4" style={{ color: 'var(--color-text-muted)' }}>
        <p>RobotSpace.io collects minimal personal data: email for quote requests and submissions only.</p>
        <p>Contact data is retained for 12 months, then anonymized. IP addresses retained 30 days for abuse prevention.</p>
        <p>No tracking cookies. No third-party analytics. No ad networks.</p>
        <p>For data export or deletion requests, contact vadikmaslov@gmail.com.</p>
      </div>
    </div>
  )
}
