import assert from 'node:assert/strict'
import { normalizeGitHubRepository, parseRobotspaceManifest } from './registry-import'

assert.equal(normalizeGitHubRepository('https://github.com/Open-RMF/rmf_ros2.git'), 'https://github.com/open-rmf/rmf_ros2')
assert.throws(() => normalizeGitHubRepository('http://github.com/org/repo'), /public GitHub/)
assert.throws(() => normalizeGitHubRepository('https://github.com/org/repo?token=x'), /public GitHub/)

const manifest = parseRobotspaceManifest(`version: 1
name: Example Navigation
description: Safe manifest fixture
project_type: navigation
license: Apache-2.0
homepage: https://example.org/project
robots:
  - slug: example-mobile-robot
    requirements:
      ros: humble
      simulation: true`)
assert.equal(manifest.project_type, 'navigation')
assert.equal(manifest.robots?.[0]?.requirements?.simulation, true)
assert.throws(() => parseRobotspaceManifest('version: 2\nname: Bad\nproject_type: tool'), /requires version 1/)
assert.throws(() => parseRobotspaceManifest('version: 1\nname: Bad\nproject_type: tool\nunknown: value'), /not allowed/)
assert.throws(() => parseRobotspaceManifest('version: 1\nname: Bad\nproject_type: tool\nhomepage: http://example.org'), /credential-free HTTPS/)

console.log('registry import parser checks PASS')
