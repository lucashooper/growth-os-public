[Skip to content →](https://linear.app/#skip-nav)

# The productdevelopmentsystem for teamsand agentsThe product development  system for teams and agentsThe product development system for teams and agents

Purpose-built for planning and building products. Designed for the AI era.

[NewLoops →](https://linear.app/now/introducing-loops) [NewLoops →](https://linear.app/now/introducing-loops)

![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/6600ca96-e49b-4fd9-c03a-7979faddad00/f=auto,fit=scale-down,metadata=none,width=2560)

![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/c7fa8f5f-d439-4329-6a65-de549b51e300/f=auto,fit=scale-down,metadata=none,width=2560)

### Faster app launch

Render UI before `vehicle_state` sync when minimum required state is present, instead of blocking on full refresh during iOS startup.

#### Activity

![Avatar of Karri](https://webassets.linear.app/images/ornj730p/production/f79251b06e9edeeacbf2875384defe629e000b3c-352x352.png?w=72&q=95&auto=format&dpr=2)

Linear created the issue via Slack on behalf ofKarri·2min ago

Triage Intelligence added the labels Performanceand iOS·2min ago

![Avatar of Karri](https://webassets.linear.app/images/ornj730p/production/f79251b06e9edeeacbf2875384defe629e000b3c-352x352.png?w=72&q=95&auto=format&dpr=2)

karri·4 min ago

Right now we show a spinner forever, which makes it look like the car disappeared...

![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/f28b59f4-538c-4517-cfd7-510913015200/f=auto,fit=scale-down,metadata=none)

jori·just now

@Linear can you take a stab at this?

![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/c2f6447a-d507-43c1-f3ab-3f2c6fbceb00/f=auto,fit=scale-down,metadata=none)

Linearconnected byJori·2 min ago

Changed 2 filesDraft PR awaiting your review·2 min ago

Linear moved from Todo toIn Progress·just now

Fix the dimmed ride rows that never reset and open a PR

DRV-364added to context

Thinking…

Reply…

Skills

Reviews

Revert

Properties

In Progress

Medium

![Avatar of Karri](https://webassets.linear.app/images/ornj730p/production/f79251b06e9edeeacbf2875384defe629e000b3c-352x352.png?w=72&q=95&auto=format&dpr=2)
Karri

![Linear](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/c2f6447a-d507-43c1-f3ab-3f2c6fbceb00/f=auto,fit=scale-down,metadata=none)Linear

Cycle 144

Labels

Performance

iOS

Releases

Linear App1.6881...⋅Jun 25

Powering the companies building the future

## **A new species of product tool.** Purpose-built for modern teams with AI workflows at its core, Linear sets a new standard for planning and building products.

Purpose-built

Linear is shaped by the practices and principles of world-class product teams.

Powered by agents

Designed for workflows shared by humans and agents. From drafting PRDs to pushing PRs.

Designed for speed

Reduces noise and restores momentum to help teams ship with high velocity and focus.

Fig 0.1

Purpose-built

Linear is shaped by the practices and principles of world-class product teams.

Fig 0.2

Powered by agentsDesigned for workflows shared by humans and agents. From drafting PRDs to pushing PRs.
Designed for workflows shared by humans and agents. From drafting PRDs to pushing PRs.

Fig 0.3

Designed for speed

Reduces noise and restores momentum to help teams ship with high velocity and focus.

## Intake  and integrations

Automatically turn conversations and customer feedback into actionable issues that are instantly routed, labeled, and prioritized for the right team.

[Learn more→](https://linear.app/intake)

Backlog8

ENG-2085

Reduce UI flicker during autonomy...

ENG-2094

Add buffering for autonomy event streams

ENG-2092

Reduce startup delay caused by vehicle sync

ENG-2200

Fix delayed route updates during rerouting

Todo71

ENG-926![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/086b510a-f5da-414b-bc9d-228afb968600/f=auto,fit=scale-down,metadata=none)

Remove UI inconsistencies

BugDesign

ENG-2088![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/302b16a5-f9ca-42f2-dbae-3c76f19b2d00/f=auto,fit=scale-down,metadata=none)

TypeError: Cannot read properties

Bug

ENG-924![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/1eb8f8b2-3593-473f-ba8a-acac99aa0300/f=auto,fit=scale-down,metadata=none)

Upgrade to Claude Opus 5

AI

ENG-1882

Optimize load times

Performance

In Progress3

ENG-1487![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/6550520e-9e50-441d-b9e8-579be321f900/f=auto,fit=scale-down,metadata=none)

Remove contentData from GraphQL API

61039

MKT-1028![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/4d3381aa-fb2f-4d3d-1a06-957fc616d400/f=auto,fit=scale-down,metadata=none)

Launch page assets

Design

ENG-2187![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/7ea107e7-c1a0-4c99-756d-5837fd91f200/f=auto,fit=scale-down,metadata=none)

Prevent duplicate ride requests on poor...

Bug62048

Done53

ENG-2074

Clean up deprecated APIs...

API61002

ENG-1912

Reduce latency in autonomy st...

61005

ENG-1951

Reduce ETA fluctuations durin...

61202

ENG-1960

Improve fallback messaging

UI61149

ENG-1991

Improve rider visibility into veh...

![didier](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/c8aeedda-7726-4a4f-226a-f573f85d8d00/f=auto,fit=scale-down,metadata=none)

didier2:43 PM

Has anyone been looking into the iOS startup performance issues?

![lena](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/580cd9c0-2770-4fe4-1ad2-95c76fc6f000/f=auto,fit=scale-down,metadata=none)

lena2:43 PM

Anyone else noticing the iOS app feels slow to open if you haven’t used it in a bit?

![didier](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/c8aeedda-7726-4a4f-226a-f573f85d8d00/f=auto,fit=scale-down,metadata=none)

didier2:43 PM

Yea, we’re still blocking initial render on a full vehicle\_state sync every time…

![andreas](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/22210a73-581d-42db-d42a-bf2907860300/f=auto,fit=scale-down,metadata=none)

andreas2:43 PM

Feels like we could render sooner and load the rest in the background. Probably also worth tracking startup timing so we know how often this happens!

@Linearcreate issues and assign to me

Features

Linear Agent+

Customer Requests+

Triage+

Linear Asks+

## Planning  and monitoring

Plan and navigate from idea to launch. Align your team with product initiatives, strategic roadmaps, and clear, up-to-date PRDs.

[Learn more→](https://linear.app/plan)

![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/7d7115d9-a0eb-4a92-5900-3ca3ee077d00/f=auto,fit=scale-down,metadata=none)

MAR

APR

MAY

JUN

JUL

AUG

SEP

2

9

16

23

6

13

20

27

4

11

18

25

1

8

15

22

6

13

20

27

3

10

17

24

7

14

21

28

UI Refresh

Core screens

Polish

Split fares

Internal

Public Beta

Autonomy status clarity

Alpha

Autonomy telemetry reliability

Beta

GA

Oct 2025

Nov 2025

Dec 2025

Jan 2026

Feb 2026

Features

Projects+

Documents+

Pulse+

Initiatives+

Visual planning+

Insights+

## AI and  automations

Build and deploy AI agents that work alongside you as teammates. Work on complex tasks together or delegate entire issues end-to-end.

[Learn more→](https://linear.app/ai)

![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/584d7dbd-ff4a-41bb-4fab-74fd5217a400/f=auto,fit=scale-down,metadata=none)

what are the three most important customer requests around permissions? add them to the Access Controls project

Worked for 8 sec

Three issues ranked by customer impact:

ENG-2298Add granular project permissions

ENG-2647Let guests access multiple teams

ENG-2352Create custom roles with scoped access

I’ve added them toAccess Controls

add retry handling for failed image uploads described in this issue

ENG-2844added to context

Thinking...

Started working on ENG-2844Failed image upload and launched a cloud agent.

Setting up DRV/rideshare-app…00:07

Review today’s mobile triage and group the issues by what should happen next

Mobile Triageadded to context

Worked for 12 sec

Reviewed eight issues: two are ready for backlog, two need details, and four belong to iOS or Android.

Backlog · 2

ENG-2521Missing inbox status colors

ENG-2364Notifications after logout…

Needs information · 2

ENG-2557Deep links discard issue drafts

ENG-2362Open PRs from mobile diffs

review this issue, draft complete offline mode requirements, and break the work into sub-issues

ENG-2521added to context

Worked for 1 min

Updated the issue with requirements, open product decisions, and acceptance criteria.

ENG-2920Define offline mode requirements

Features

Linear Agent+

Coding sessions+

Triage+

Linear MCP+

## Build, review,  and ship

Streamline code reviews with clear diffs, better context, and fewer back-and-forth comments. Keep PRs moving without sacrificing quality.

[Learn more→](https://linear.app/build)

![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/c16152f3-a36c-468e-89ae-f87c2f244d00/f=auto,fit=scale-down,metadata=none)

In Review3

ENG-2498Replace isFullySynced with a sync status

#54910

iOS![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/c9d0b44c-78f9-4a9b-0a8e-f06a8187be00/f=auto,fit=scale-down,metadata=none)Oct 9

ENG-2380Show a stale data banner while syncing

#55167

Reliability![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/675bbc53-1be0-4106-e66e-35b93c172300/f=auto,fit=scale-down,metadata=none)Oct 9

ENG-2039Pass sync status to the dashboard

#55209

Bug

Reliability![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/ad091a28-fb2c-41be-409b-6b1774f3a200/f=auto,fit=scale-down,metadata=none)Oct 8

In Progress4

ENG-2076Reduce ETA jitter

#55423

PerformanceWorking…![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/13a0909f-186f-4d83-3fd3-d04883ec2d00/f=auto,fit=scale-down,metadata=none)![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/36d030ed-3a7c-48bb-349b-0427c2b60d00/f=auto,fit=scale-down,metadata=none)Oct 6

ENG-2108Handle GPS dropouts gracefully

#55409

MapsWorking…![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/13a0909f-186f-4d83-3fd3-d04883ec2d00/f=auto,fit=scale-down,metadata=none)![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/36d030ed-3a7c-48bb-349b-0427c2b60d00/f=auto,fit=scale-down,metadata=none)Oct 2

ENG-2143Optimize map tile loading on initial app open

Maps![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/c9d0b44c-78f9-4a9b-0a8e-f06a8187be00/f=auto,fit=scale-down,metadata=none)Oct 7

ENG-2187Prevent duplicate ride requests on poor networks

BugWorking…![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/f9ed2721-1966-4abc-129b-93aaac1a6200/f=auto,fit=scale-down,metadata=none)![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/21de8e51-12ad-4d17-e347-f0e038c3a000/f=auto,fit=scale-down,metadata=none)Oct 5

Todo4

ENG-2254Reduce unnecessary map re-rendering on home screen

Maps![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/f28b59f4-538c-4517-cfd7-510913015200/f=auto,fit=scale-down,metadata=none)Oct 10

ENG-2291Clean up deprecated APIs used by the rider app

API![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/e3bd83aa-9996-412f-0da3-7bf1f4701100/f=auto,fit=scale-down,metadata=none)Oct 9

ENG-2327Speed up CI pipelines for mobile builds

Performance![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/21de8e51-12ad-4d17-e347-f0e038c3a000/f=auto,fit=scale-down,metadata=none)Oct 9

ENG-2358Reduce flakiness in mobile UI tests

Reliability![](https://linear.app/cdn-cgi/imagedelivery/fO02fVwohEs9s9UHFwon6A/e0a81846-aac4-488d-743e-cac098b8f700/f=auto,fit=scale-down,metadata=none)Oct 4

kinetic-ios/src/screens/Home/HomeScreen.tsxkinetic-ios/src/HomeScreen.tsx

```
import React from 'react'import { View, ActivityIndicator } from 'react-native'import { useVehicleState } from '@hooks/useVehicleState'import { Dashboard } from '@components/Dashboard'export const HomeScreen = () => {  const { vehicleState, isFullySynced } = useVehicleState()  if (!isFullySynced) {    return <ActivityIndicator size="large" />  }  return (    <View>      <Dashboard state={vehicleState} />    </View>  )}
```

```
import React from 'react'import { View, ActivityIndicator } from 'react-native'import { useVehicleState, SyncStatus } from '@hooks/useVehicleState'import { Dashboard } from '@components/Dashboard'export const HomeScreen = () => {  const { vehicleState, syncStatus } = useVehicleState()  if (syncStatus === SyncStatus.PENDING) {    return <ActivityIndicator size="large" />  }  return (    <View>      <Dashboard state={vehicleState} syncStatus={syncStatus} />    </View>  )}import React from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useVehicleState, SyncStatus } from '@hooks/useVehicleState'
import { Dashboard } from '@components/Dashboard'

export const HomeScreen = () => {
  const { vehicleState, syncStatus } = useVehicleState()

  if (syncStatus === SyncStatus.PENDING) {
    return <ActivityIndicator size="large" />
  }

  return (
    <View>
      <Dashboard state={vehicleState} syncStatus={syncStatus} />
    </View>
  )
}
```

```
export const CodeReview = () => {  <Diff.Provider>    <Slow />    <Fragmented />    <HumanOnly />    <Frictionless />    <Integrated />    <AgentReady />  </Diff.Provider>};
```

Linear

Features

Issues+

Git automations+

Guided reviews+

Cycles+

Diffs+

Releases+

## Changelog

[Coding sessions\\
\\
Linear Agent can now set up, run, and test your code before returning its work. That means fewer handoffs and changes that are further along when they come back to you.\\
\\
Aug 19, 2026](https://linear.app/changelog/2026-08-20-coding-environments)

[Team initiatives\\
\\
Initiatives are Linear's way to manage product strategy and high-level planning across projects. Strategy may start at the company level, but teams carry it forward. You can now assign a team to lead an initiative, making it clear who is responsible for driving the work and how it contributes to the broader direction.\\
\\
Aug 13, 2026](https://linear.app/changelog/2026-08-13-team-initiatives)

[Coding sessions on mobile\\
\\
Your coding session doesn’t have to stop when you leave your desk. Use the Linear mobile app to review code changes, comment on specific lines, and iterate with Linear Agent.\\
\\
Jul 30, 2026](https://linear.app/changelog/2026-07-30-coding-sessions-on-mobile)

[Agent-assisted text editing\\
\\
Documents and project descriptions are critical context for your teams and agents.\\
\\
Jul 22, 2026](https://linear.app/changelog/2026-07-23-agent-assisted-editing)

[View all→](https://linear.app/changelog)

[> You’ll probably build a better product, just because of the craft that using Linear infuses on your brain.\\
\\
Gabriel PealOpenAI](https://linear.app/customers/openai) [> Our speed is intense and Linear helps us be action biased.\\
\\
Nik KoblovRamp](https://linear.app/customers/ramp) [> Linear is excellent, just excellent. It has the right opinions for fast moving teams.\\
\\
Kaz NejatianOpendoor](https://linear.app/customers/opendoor)

[You’ll probably build a better product, just because of the craft that using Linear infuses on your brain.\\
\\
Gabriel PealStaff Software Engineer, OpenAI](https://linear.app/customers/openai) [Our speed is intense and Linear helps us be action biased.\\
\\
Nik KoblovHead of Engineering, Ramp](https://linear.app/customers/ramp)

Linear powers over **40,000** product teams. From ambitious startups to major enterprises.

[Customer stories→](https://linear.app/customers)

## Built for the future. Available today.

[Get started](https://linear.app/signup) [Contact sales](https://linear.app/contact/sales) [Open app](https://linear.app/login) [Download](https://linear.app/download)