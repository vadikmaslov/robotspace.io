import Link from 'next/link'
import { auth } from '../../auth'
import { prisma } from '@robotspace/db'
import { manufacturerStatementTypes } from '../../lib/manufacturer-voice'
import { beginManufacturerClaimAction, publishManufacturerStatementAction, revokeManufacturerClaimAction, signInForManufacturer, verifyManufacturerClaimAction } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Claim a manufacturer', robots: { index: false, follow: false } }

const messages: Record<string, string> = {
  ACCOUNT: 'Sign in with GitHub to continue.', COMPANY: 'This company needs a published profile and a verified official website.',
  DISABLED: 'Manufacturer claims or publishing are being prepared.',
  DOMAIN: 'The verified company website is not a supported HTTPS domain.', PROOF: 'The DNS record was not found or does not match yet.',
  EXPIRED: 'The DNS challenge expired. Create a new one.', PERMISSION: 'You do not have publishing access for this company or robot.',
  INPUT: 'Check the statement and its evidence URL.', ERROR: 'The request could not be completed. Try again.',
  RATE_LIMIT: 'Too many verification attempts. Try again in 15 minutes.',
  CHALLENGE: 'Add the DNS record below, then confirm ownership.', VERIFIED: 'Company ownership verified.',
  REVOKED: 'Manufacturer access revoked.', PUBLISHED: 'Official statement published.',
}

export default async function ManufacturerPage({ searchParams }: { searchParams: Promise<{ company?: string; result?: string }> }) {
  const { company: requested, result } = await searchParams
  const slug = typeof requested === 'string' && /^[a-z0-9][a-z0-9-]{0,254}$/.test(requested) ? requested : ''
  const session = await auth()
  const userId = session?.user?.sessionKind === 'registry' ? session.user.registryUserId : null
  const entity = slug ? await prisma.entities.findFirst({ where: { slug, entity_type: 'COMPANY', publication_status: 'PUBLISHED', archived_at: null } }) : null
  const company = entity ? await prisma.company_public_projections.findUnique({ where: { company_entity_id: entity.id } }) : null
  const claim = entity && userId ? await prisma.entity_claims.findFirst({ where: { entity_id: entity.id, claimant_id: userId, status: { in: ['PENDING', 'VERIFIED'] } }, orderBy: { created_at: 'desc' } }) : null
  const proof = claim ? await prisma.manufacturer_claim_proofs.findUnique({ where: { claim_id: claim.id } }) : null
  const relations = entity ? await prisma.robot_company_relations.findMany({ where: { company_entity_id: entity.id, relation: 'MANUFACTURES' } }) : []
  const robots = relations.length ? await prisma.robot_public_projections.findMany({ where: { robot_entity_id: { in: relations.map(relation => relation.robot_entity_id).filter((id): id is string => Boolean(id)) }, lifecycle_status: 'ACTIVE' } }) : []
  return <main className="max-w-[760px] mx-auto px-6 py-12 space-y-6"><Link href={slug ? `/companies/${slug}` : '/companies'} className="text-sm underline">Back to company</Link><h1 className="text-3xl font-semibold">Claim a manufacturer</h1><Link href="/faq#official-resources" className="text-sm underline">DNS verification and official statements explained</Link>
    {result && messages[result] && <p role="status" className="rounded-lg border p-3 text-sm">{messages[result]}</p>}
    {!company ? <p>Open a published company profile to begin.</p> : <><p>Confirm control of <strong>{company.canonical_name}</strong> through a DNS TXT record on its verified website domain. This grants access to official statements for its linked robots.</p>
      {!company.official_url_verified_at || !company.official_url ? <p>The company website must first be verified by RobotSpace editors.</p> : !userId ? <form action={signInForManufacturer}><input type="hidden" name="company" value={slug} /><button className="rounded-md border px-4 py-2">Sign in with GitHub</button></form> : <>
        {claim?.status === 'VERIFIED' ? <div className="rounded-lg border p-4 space-y-3"><p className="font-medium">Verified manufacturer</p><form action={revokeManufacturerClaimAction}><input type="hidden" name="company" value={slug} /><input type="hidden" name="claim" value={claim.id} /><button className="rounded-md border px-3 py-2 text-sm">Revoke my access</button></form></div> : <div className="rounded-lg border p-4 space-y-3"><form action={beginManufacturerClaimAction}><input type="hidden" name="company" value={slug} /><button className="rounded-md border px-3 py-2">{claim ? 'Create new challenge' : 'Start DNS verification'}</button></form>{claim && proof && <><p className="text-sm">Create TXT record <code>_robotspace.{proof.domain}</code> with value:</p><code className="block break-all rounded border p-3">{proof.token}</code><p className="text-xs">Expires {proof.expires_at.toISOString().slice(0, 16)} UTC.</p><form action={verifyManufacturerClaimAction}><input type="hidden" name="company" value={slug} /><button className="rounded-md border px-3 py-2">Check DNS and verify</button></form></>}</div>}
        {claim?.status === 'VERIFIED' && <section className="rounded-lg border p-4 space-y-4"><h2 className="text-xl font-medium">Publish an official statement</h2><p className="text-sm">Your statement appears separately from editorial facts and community findings. Provide an evidence page on the verified company domain.</p><form action={publishManufacturerStatementAction} className="grid gap-3"><input type="hidden" name="company" value={slug} /><label>Applies to<select name="robot" className="block w-full rounded border p-2"><option value="">Company</option>{robots.map(robot => <option key={robot.robot_entity_id} value={robot.robot_entity_id}>{robot.canonical_name}</option>)}</select></label><label>Type<select name="type" className="block w-full rounded border p-2">{manufacturerStatementTypes.map(type => <option key={type}>{type}</option>)}</select></label><label>Title<input name="title" required maxLength={255} className="block w-full rounded border p-2" /></label><label>Value for a specification<input name="value" maxLength={1000} className="block w-full rounded border p-2" /></label><label>Resource URL for docs, SDK, repository or release<input name="url" type="url" className="block w-full rounded border p-2" /></label><label>Evidence URL on company website<input name="evidence" type="url" required className="block w-full rounded border p-2" /></label><button className="rounded-md border px-4 py-2 w-fit">Publish statement</button></form></section>}
      </>}
    </>}
  </main>
}
