# Robot ecosystem pages

Robot detail pages keep their existing specifications, manufacturer, comparison and news sections. The ecosystem section adds verified first-party resources and software linked through the Registry graph.

## Publication rules

- An official resource is stored in `robot_resources` and is public only while its status is `VERIFIED`.
- A resource must belong to an active robot entity. Its robot, type, URL, evidence URL, creator and creation time cannot be changed after insertion.
- Rejecting a resource is permanent. A corrected link is added as a new resource so the old record remains auditable.
- A compatible project is public only when the robot-project compatibility is `VERIFIED`, the project entity is `PUBLISHED`, and the software package is `VERIFIED`.
- `origin_status=OFFICIAL` and all other origins are rendered in separate sections. Community material is never presented as first-party material.
- Developer profiles appear only for active Registry users with a verified claim on a project visible in that robot ecosystem.

## Editorial workflow

An administrator opens the existing robot edit page and adds a resource type, public label, HTTPS destination and HTTPS evidence link. The evidence should be a first-party page that demonstrates the destination is controlled or endorsed by the robot manufacturer.

The public page does not automatically treat the legacy `official_url` catalog field as verified. It can prefill the admin form, but an editor still has to supply evidence.

Developers can start a compatibility suggestion from the robot page. They must sign in with GitHub and select a project for which they hold a verified claim. The suggestion remains hidden until moderation accepts it.

## Maturity indicators

The page reports counts of verified resources, compatible projects, public maintainers, project types and the latest dated activity. These are factual coverage indicators. They are deliberately not combined into a RobotSpace score.

## Empty state

A robot with no verified ecosystem records still shows its original catalog information and an explicit empty state. Unverified links and projects are omitted rather than guessed.
