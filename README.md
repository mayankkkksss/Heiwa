# HEIWA (平和) — A Quiet Life in Japan

HEIWA (平和) is a contemplative, third-person open-world Japanese neighborhood exploration game built for modern web browsers using **Three.js** and **Vite**.

Set in the peaceful residential district of **Sakuragaoka**, the game immerses players in the quiet charm of everyday Japanese life. Walk along quiet residential streets lined with cherry blossoms, browse snacks at the local HIKARI MART convenience store, sit in the neighborhood park listening to birdsong, greet local residents going about their daily routines, pet Mochi the neighborhood calico cat, and take your personal compact commuter car out past the town boundaries into a vast, deterministically generated procedural countryside.

HEIWA is designed around atmosphere, environmental mindfulness, and calm exploration rather than conflict or score-chasing.

---

## 🌸 Table of Contents

- [Overview & Game Concept](#-overview--game-concept)
- [Core Features](#-core-features)
- [The World of Sakuragaoka](#-the-world-of-sakuragaoka)
  - [Sakura Heights Residence](#sakura-heights-residence)
  - [HIKARI MART Convenience Store](#hikari-mart-convenience-store)
  - [Sakuragaoka Park](#sakuragaoka-park)
  - [Residential Streets & Infrastructure](#residential-streets--infrastructure)
- [Procedural World & Open-World Generation](#-procedural-world--open-world-generation)
  - [Deterministic World Seed](#deterministic-world-seed)
  - [Chunk Architecture & Coordinate Space](#chunk-architecture--coordinate-space)
  - [Land-Use Zoning & Road Hierarchy](#land-use-zoning--road-hierarchy)
  - [Procedural Building & Destination Placement](#procedural-building--destination-placement)
- [World Streaming Architecture](#-world-streaming-architecture)
- [Player Kinematics & Locomotion](#-player-kinematics--locomotion)
- [Vehicle & Driving System](#-vehicle--driving-system)
- [NPC Simulation & Daily Routines](#-npc-simulation--daily-routines)
- [Quest System: The Morning Errand](#-quest-system-the-morning-errand)
- [Contextual Interaction System](#-contextual-interaction-system)
- [Cinematic Camera System](#-cinematic-camera-system)
- [Minimap & Navigation](#-minimap--navigation)
- [Day/Night Cycle & Atmospheric Lighting](#-daynight-cycle--atmospheric-lighting)
- [Save, Resume & Reset System](#-save-resume--reset-system)
- [Controls & Key Customization](#-controls--key-customization)
  - [Default Controls Table](#default-controls-table)
  - [Custom Key Binding System](#custom-key-binding-system)
  - [Vehicle Controls](#vehicle-controls)
- [Mobile Support & Fullscreen Architecture](#-mobile-support--fullscreen-architecture)
  - [Orientation Detection & Portrait Alert](#orientation-detection--portrait-alert)
  - [User-Activated Fullscreen Flow & Android Chrome](#user-activated-fullscreen-flow--android-chrome)
  - [iOS Safari Full-Viewport Fallback](#ios-safari-full-viewport-fallback)
  - [Touch Controls & Virtual Joystick](#touch-controls--virtual-joystick)
- [Procedural Audio & Atmosphere](#-procedural-audio--atmosphere)
- [Visual Direction & Aesthetics](#-visual-direction--aesthetics)
- [Technical Architecture](#-technical-architecture)
- [Project Directory Structure](#-project-directory-structure)
- [Technology Stack](#-technology-stack)
- [Current Production Status](#-current-production-status)
- [Getting Started & Development Setup](#-getting-started--development-setup)
- [Available Scripts](#-available-scripts)
- [Production Build & Vercel Deployment](#-production-build--vercel-deployment)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Performance & Optimization](#-performance--optimization)
- [Browser Compatibility & Troubleshooting](#-browser-compatibility--troubleshooting)
- [Development Guidelines & Language Rule](#-development-guidelines--language-rule)
- [Credits](#-credits)

---

## 🌿 Overview & Game Concept

In HEIWA, you play as **Mayank**, waking up on a crisp spring morning in the Sakura Heights apartment complex. The neighborhood outside is just beginning its day: Mrs. Tanaka is tending to her flowerbeds, Daisuke is delivering morning parcels, students and salarymen are heading toward their commutes, and cherry blossom petals gently drift across the pavement in the morning breeze.

### The Journey
1. **Wake Up in Sakuragaoka**: Step out of Sakura Heights into the quiet morning air of the neighborhood.
2. **Morning Errand**: Follow a gentle introductory errand down Shopping Street to HIKARI MART to pick up breakfast and a hot drink.
3. **Connect with the Community**: Walk to Sakuragaoka Park, greet Mrs. Tanaka by the blooming garden, and pet Mochi the resident calico cat.
4. **Unlock Free Exploration**: Complete the morning tasks to unlock full exploration of the town.
5. **Take to the Open Road**: Board Mayank's compact commuter car parked on the residential lane, start the engine, and venture out along the regional road network into the rolling countryside.
6. **Pick Up Anytime**: Seamless automatic saving ensures your exact player coordinates, vehicle status, quest progress, time of day, and custom key bindings are restored whenever you return.

---

## ✨ Core Features

- **Third-Person Exploration**: Smooth camera-relative walking, jogging, jumping, sitting on benches, and environmental interactions.
- **Authoritative Solid Collision**: Multi-substep continuous collision detection with axis-decoupled wall sliding around houses, walls, fences, utility poles, trees, planters, and benches.
- **Living NPC Simulation**: 10 distinct neighborhood residents with individual visual identities, pathfinding schedules, morning-to-evening routines, and interactive dialogue.
- **Procedural Open-World Streaming**: Deterministic, infinite chunk-based streaming system with multi-tier road networks, zoning (Suburban, Farmland, Woodland), roadside props, and distant mountain backdrops.
- **Physical Vehicle System**: Driveable compact Japanese commuter car with 4-point ground probing, realistic body pitch on terrain slopes and during acceleration/braking, headlight illumination, and seamless coordinate-accurate entry/exit.
- **Dynamic 24-Hour Day/Night Cycle**: Smooth solar trajectory with morning, midday, golden-hour, twilight, and nighttime illumination, accompanied by street lamps and shop window glows. Single-hour time step shortcut available (`[T]`).
- **Interactive Minimap**: Toggleable circular HUD minimap (`[M]`) displaying roads, authored district features, and a directional chevron indicating player orientation.
- **Robust Local Save & Resume**: Automatic multi-trigger persistence (`localStorage`) saving player position, vehicle state, quest state, world seed, and clock time, with a confirmation-protected Reset Game option.
- **Customizable Key Bindings**: Comprehensive Settings modal allowing full remapping of keyboard actions with collision detection, reserved key filtering, and persistent storage.
- **Mobile Orientation Alert & Fullscreen System**: Automatic portrait orientation blocker, 1-tap user-activated fullscreen entry for Android Chrome, full-viewport landscape fallback for iOS Safari, and responsive virtual controls.
- **In-Game Credits & Info Modals**: Polished, accessible Credits and About modals accessible from Title Screen, Pause Menu, and Settings, linking directly to the developer's GitHub.
- **Procedural Web Audio Soundscape**: Fully synthetic ambient audio featuring zone-based wind, suburban background hum, store fluorescent resonance, parametric birdsong, footstep sounds, and UI chimes.
- **Zero Localhost/Backend Dependencies**: Pure client-side static application engineered for high-performance deployment on Vercel and modern static hosts.

---

## 🏙️ The World of Sakuragaoka

The authored starting district of **Sakuragaoka** spans an area from coordinates `(-140, -140)` to `(140, 140)` meters, meticulously crafted to represent an authentic Tokyo suburban enclave.

```
                  [ NORTH REGIONAL ROAD ]
                            │
   ┌────────────────────────┼────────────────────────┐
   │                  Sakuragaoka                    │
   │                     Park                        │
   │   (Sakura Grove, Fountain, Flowerbed, Benches)  │
   │                                                 │
   │  Residential West               Shopping Street │
   │  ┌──────────────┐              ┌──────────────┐ │
   │  │Sakura Heights│              │ HIKARI MART  │ │
   │  │ (Home/Spawn) │              │(Convenience) │ │
   │  └──────┬───────┘              └──────┬───────┘ │
   │         │ [Car Parking Space]         │         │
   │         └──────────────┬──────────────┘         │
   │                  Main Street                    │
   └────────────────────────┼────────────────────────┘
                            │
                  [ SOUTH REGIONAL ROAD ]
```

### Sakura Heights Residence
- **Location**: Coordinate `(-24.0, 0, -46.5)`
- **Function**: Mayank's home apartment building and the primary game spawn point.
- **Features**: Traditional entryway, ground-floor mailboxes, canopy shelter, parked bicycle rack, and perimeter block wall.

### HIKARI MART Convenience Store
- **Location**: Coordinates `(22.0, 0, 42.0)`
- **Function**: The commercial hub of Sakuragaoka and destination for the opening errand.
- **Features**: Fully realized interior with snack/drink aisles, refrigerated coolers, checkout register, employee Aoi on duty, outdoor recycling receptacles, and dedicated front parking space.

### Sakuragaoka Park
- **Location**: Center-North quadrant `(-35 to +10, -20 to +25)`
- **Function**: The natural and community gathering space of the neighborhood.
- **Features**: Lush cherry blossom (Sakura) grove with drifting petal particles, central drinking fountain, flowerbeds tended by Mrs. Tanaka, playground with swing set and slide, and park benches where Mayank can sit and take in the view.

### Residential Streets & Infrastructure
- **Authentic Japanese Road Architecture**: Asphalt roadways with dark asphalt textures, concrete sidewalk curbs, white pedestrian crosswalks, yellow tactile paving strips, drainage gutters, and roadside bus stop signs.
- **Utility Network**: Wooden and concrete utility poles complete with crossarms, transformers, and overhead power cables traversing the streets.
- **Street Amenities**: Illuminated drink vending machines, postal mailboxes, neighborhood bulletin boards, and covered municipal garbage collection stations.

---

## 🗺️ Procedural World & Open-World Generation

Beyond the authored starting town of Sakuragaoka lies an open procedural landscape generated deterministically on the fly.

### Deterministic World Seed
The entire procedural universe is derived from a master 32-bit world seed (`HEIWA_WORLD_SEED = 20260927`). Using split-mix and coordinate hashing algorithms, every road curve, mountain contour, building plot, and tree cluster is generated identically across game sessions and save/resume reloads.

### Chunk Architecture & Coordinate Space
- **Chunk Dimensions**: 100m × 100m square tiles aligned to a global grid `(chunkX, chunkZ)`.
- **Authoritative Elevation**: A single mathematical elevation function `getTerrainHeight(x, z, seed)` governs terrain meshes, road splines, building plinths, player grounding, and vehicle suspension.

### Land-Use Zoning & Road Hierarchy
Chunks transition across three distinct geographic zones:
1. **Suburban Zone**: Low-density residential lanes, standalone houses with foundation plinths, garden walls, and street lamps.
2. **Farmland Zone**: Open agricultural fields, crop rows, gravel access tracks, irrigation ditches, and utility lines.
3. **Woodland Zone**: Rolling hills, dense pine and broadleaf forests, rocky outcrops, and guardrail-lined highway curves.

Roads follow a clear hierarchy:
- **Major Arterial Corridors**: Wide 8-meter paved highways with yellow centerlines, metal guardrails, and streetlights.
- **Collector Streets**: 6-meter residential streets with white lane markings and pedestrian walking paths.
- **Rural Tracks**: 4-meter compacted gravel roads winding through farmland and wooded terrain.

### Procedural Building & Destination Placement
Buildings in procedural chunks adhere to strict spatial clearance rules:
- Protected clearance envelope along road corridors (no buildings on roads).
- Foundation slope validation (no floating or subterranean structures on steep hillsides).
- Procedural destination landmarks generated at specific regional coordinates (scenic overlooks, roadside shrines, rural farming depots).

---

## 🔄 World Streaming Architecture

The `WorldStreamingSystem` manages seamless chunk streaming as Mayank travels on foot or at high speeds in his car:

```
[ UNLOADED ]  ──(Player Enters Range)──►  [ GENERATION QUEUE ]
                                                 │
                                           (Mesh & Collider Build)
                                                 │
                                                 ▼
[ ACTIVE (In Scene & Physics) ]  ◄──────── [ CHUNK READY ]
      │
(Player Exceeds Unload Radius)
      │
      ▼
[ CLEANUP & DISPOSAL ]  ────────────────►  [ UNLOADED ]
```

- **Active Grid**: A 5×5 chunk grid (`ACTIVE_RADIUS = 2`, covering 500m × 500m) is kept fully loaded in the scene graph and spatial collision grid.
- **Unload Radius**: Chunks beyond distance 3 (`UNLOAD_RADIUS = 3`) are systematically unmounted, geometries disposed of, and colliders unregistered to keep memory footprint minimal.
- **Velocity-Aware Preloading**: When driving at high speeds, the streaming focus extends forward along the vehicle's velocity vector to guarantee road chunks generate before the vehicle reaches them.
- **Distant Horizon Scenery**: A lightweight procedural mountain ring mesh surrounds the active world, maintaining horizon continuity.

---

## 🏃 Player Kinematics & Locomotion

Mayank's locomotion is governed by `PlayerSystem`, featuring responsive physics, smooth camera-relative steering, and procedural skeletal animation.

### Kinematic Properties
| Parameter | Value | Description |
|---|---|---|
| **Walk Speed** | `2.8 m/s` | Natural human walking pace |
| **Jog Speed** | `4.8 m/s` | Relaxed suburban jog |
| **Walk Acceleration** | `9.5 m/s²` | Smooth ramp to walking speed |
| **Jog Acceleration** | `11.0 m/s²` | Responsive transition into sprint |
| **Walk Deceleration** | `14.0 m/s²` | Clean stopping without ice-skating feel |
| **Jump Velocity** | `5.6 m/s` | Realistic ~0.85m apex jump |
| **Gravity** | `-17.5 m/s²` | Grounded, responsive falling curve |
| **Rotation Speed** | `12.0 rad/s` | Smooth character turning toward travel direction |

### Procedural Animations & States
- **Natural Gait Cycle**: Procedurally computed arm swings, leg strides, foot lift arcs, and spine bobbing tailored to current ground velocity.
- **Jump & Fall Blending**: Distinct anticipation crouch, airborne leg tuck, and landing compression phases.
- **Sitting Pose**: Interacting with park benches or chairs transitions Mayank into a relaxed sitting posture, disabling locomotion while allowing free camera look.

---

## 🚗 Vehicle & Driving System

Mayank's personal car is an authentic compact Japanese commuter vehicle managed by `VehicleSystem`.

```
                  ┌──────────────────────┐
                  │   Compact Kei Car    │
                  ├──────────────────────┤
                  │ Length: 3.4m         │
                  │ Width:  1.48m        │
                  │ Height: 1.55m        │
                  │ Wheelbase: 2.4m      │
                  │ Top Speed: ~50 km/h  │
                  └──────────────────────┘
```

### Driving Dynamics
- **Acceleration & Braking**: Realistic progressive acceleration (`6.5 m/s²`), stopping brakes (`14.0 m/s²`), rolling friction (`3.0 m/s²`), and handbrake (`24.0 m/s²`).
- **Speed Profile**: Top forward speed of `14.0 m/s` (~50 km/h) and reverse speed of `-4.2 m/s` (~15 km/h).
- **4-Point Suspension & Grounding**: Probes terrain elevation under all four wheels independently, preventing ground clipping and automatically calculating chassis pitch and lateral roll on hill climbs and banks.
- **Chassis Pitch Dynamics**: Natural body squat under acceleration and nose dip under braking.
- **Visuals**: Animated spinning wheels, steerable front axle, glass windshield, cabin interior, and functional headlights.

### Entry & Exit Lifecycle
1. Approach the car parked in the neighborhood or countryside.
2. The contextual prompt displays `[E] Enter Car`.
3. Press `[E]` to begin the entry interaction, then confirm to enter the driver's seat.
4. Camera transitions to vehicle pursuit mode.
5. Drive freely through town or into procedural regions.
6. Press `[E]` at any time to exit; Mayank disembarks beside the vehicle at its **exact current world coordinates**.

---

## 👥 NPC Simulation & Daily Routines

Sakuragaoka is populated by 10 neighborhood residents, each running autonomous daily routines driven by `NPCSystem` and `WaypointNetwork`.

```
                    ┌───────────────────────────┐
                    │      24-Hour Schedule     │
                    ├───────────────────────────┤
                    │ Morning   (05:00 - 11:00) │
                    │ Midday    (11:00 - 16:00) │
                    │ Afternoon (16:00 - 19:00) │
                    │ Evening   (19:00 - 05:00) │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
           [ Evaluate Active Waypoint & Task Activity ]
                                  │
              ┌───────────────────┴───────────────────┐
              ▼                                       ▼
    [ Waypoint Pathfinding ]                [ Activity State ]
    (Walking, Turning, Greeting)            (Garden, Sit, Shop, Wait)
```

### Neighborhood Roster
1. **Mrs. Tanaka** (`👵`): Elderly resident and passionate neighborhood gardener. Tends the park flowerbeds in the morning and relaxes on the porch in the evening.
2. **Mochi** (`🐱`): Friendly calico cat roaming freely between the park grove, fountain, and Sakura Heights canopy.
3. **Aoi** (`🏪`): Cheerful store clerk at HIKARI MART. Manages the cash register, inspects cooler stock, and greets shoppers.
4. **Kenji** (`🎒`): Local student with a backpack walking along the east street to morning classes and stopping at vending machines.
5. **Mr. Sato** (`💼`): Diligent office worker in a navy business suit commuting along the main street crosswalks.
6. **Yuka** (`🌸`): Neighborhood mother enjoying strolls through the park and shopping for fresh groceries.
7. **Hiroshi** (`🚴`): Active neighborhood cyclist visiting the vending hub and checking bicycle parking areas.
8. **Mr. Takahashi** (`👴`): Elder community resident who spends peaceful mornings resting on the park benches.
9. **Sakura** (`📷`): Enthusiastic photographer capturing seasonal cherry blossom blooms around the neighborhood.
10. **Daisuke** (`📦`): Local parcel courier in uniform delivering packages to Sakura Heights and residential doorsteps.

---

## 📜 Quest System: The Morning Errand

The opening narrative sequence introduces players to Sakuragaoka's geography and mechanics:

1. **Step 1: Morning Errand** (`errand_drink`): Step out of Sakura Heights and walk down Shopping Street to HIKARI MART to pick up a morning drink.
2. **Step 2: Visit Sakuragaoka Park** (`meet_tanaka`): Carry your morning snack to the park and speak with Mrs. Tanaka by the flowerbed.
3. **Step 3: Gentle Companion** (`pet_cat`): Find Mochi the calico cat resting near the park path and pet her.
4. **Free Exploration Unlocked**: Completing the errand tasks marks the quest line complete and invites the player to freely explore the district or drive out into the procedural countryside.

---

## 💬 Contextual Interaction System

The `InteractionSystem` continuously evaluates nearby interactive objects and displays unobtrusive UI prompts on the HUD:

- **NPCs & Mochi**: Talk with residents or pet Mochi.
- **Convenience Store Registers & Shelves**: Browse breakfast items, hot canned coffee, and onigiri.
- **Vending Machines**: Inspect beverage options.
- **Park Benches**: Sit down to rest and enjoy the surroundings.
- **Drinking Fountain**: Take a refreshing drink.
- **Mayank's Car**: Enter and exit the vehicle.
- **Mailboxes & Bulletin Boards**: Read neighborhood notices.

---

## 🎥 Cinematic Camera System

The `CameraSystem` provides an intuitive, collision-aware third-person perspective:

- **Free Mouse-Look**: Smooth 360-degree orbital look with native pointer lock support.
- **Comfortable Framings**: Default follow distance of `4.2m` and eye level of `1.46m`.
- **Pitch Clamping**: Vertical angle clamped between `-0.15 rad` (looking slightly upward) and `+1.10 rad` (looking downward).
- **Anti-Clipping Raycasting**: Automatically zooms the camera closer to the player if buildings, walls, or fences obstruct the line of sight.
- **Vehicle Camera**: Automatically expands follow distance and raises camera height when driving to give a clear view of the road ahead.

---

## 🗺️ Minimap & Navigation

Located in the upper-left corner of the HUD:
- **Display**: Real-time canvas rendering of surrounding roads, parks, building footprints, and landmarks.
- **Player Orientation Chevron**: Sharp vector directional arrow indicating the exact compass heading of the player or vehicle.
- **Toggle View (`[M]`)**: Press `[M]` or click the minimap to toggle between compact corner radar mode and an expanded district overview.

---

## ☀️ Day/Night Cycle & Atmospheric Lighting

The `WorldSystem` features an orbital sun model simulating authentic Japanese lighting conditions:

- **Morning (05:00 – 11:00)**: Soft warm golden sunlight (`#fff7ed`) with gentle peach horizon tones and long morning shadows.
- **Midday (11:00 – 16:00)**: Crisp, bright daylight (`#ffffff`) with high contrast.
- **Afternoon / Golden Hour (16:00 – 19:00)**: Rich amber warmth and elongated golden shadows.
- **Evening & Night (19:00 – 05:00)**: Deep navy skybox with illuminated streetlights, glowing vending machines, and warm interior window lighting.
- **Manual Time Advancement (`[T]`)**: Press `[T]` in-game to advance time by exactly 1 hour for quick inspection of lighting conditions and NPC schedule transitions.

---

## 💾 Save, Resume & Reset System

HEIWA features a client-side persistence architecture managed by `SaveSystem` (`localStorage` key: `heiwa_save_v1`):

### Saved State Payload
- **Player**: Position `(X, Y, Z)`, heading angle, movement state, and sitting status.
- **Vehicle**: Position `(X, Y, Z)`, velocity, steering angle, terrain pitch/roll, and driving state.
- **World & Time**: Authoritative clock time (`timeOfDayHours`) and master seed (`worldSeed`).
- **World Streaming**: Active center chunk coordinates and discovered destination registry.
- **Quests**: Current quest index and completed objective progress.
- **Camera**: Orbital yaw and pitch angles.

### Autosave Triggers
- Periodic interval saving during active gameplay.
- Page visibility change (`document.visibilitychange` to hidden).
- Page hide and unload events (`pagehide`, `beforeunload`).

### Reset Game Flow
- Located under **Settings → Reset Game**.
- Requires confirmation via a dedicated modal dialog (`"Reset Game? Your saved progress will be permanently deleted."`).
- Permanently deletes the `heiwa_save_v1` storage key.
- Cancels all pending debounced autosaves to prevent stale state re-creation.
- Re-initializes Player, Vehicle, Camera, Quest, World Streaming, and Time to default starting conditions.
- **Preserves custom key bindings** (`heiwa_keybindings_v1`), keeping player control preferences intact.

---

## 🎮 Controls & Key Customization

### Default Controls Table

| Action | Keyboard / Mouse | Touch / Mobile |
|---|---|---|
| **Move Forward** | `W` / `Arrow Up` | Virtual Joystick (Drag Up) |
| **Move Backward** | `S` / `Arrow Down` | Virtual Joystick (Drag Down) |
| **Move Left (Strafe)** | `A` / `Arrow Left` | Virtual Joystick (Drag Left) |
| **Move Right (Strafe)** | `D` / `Arrow Right` | Virtual Joystick (Drag Right) |
| **Camera Orbit** | Mouse Move / Drag | Right Screen Drag Zone |
| **Jog / Sprint** | `Shift` (Hold) | `RUN` Button (Hold) |
| **Jump** | `Space` | `JUMP` Button |
| **Interact / Dialogue** | `E` / `Enter` | `ACTION` Button |
| **Minimap Toggle** | `M` | Tap Minimap |
| **Advance Time (+1h)** | `T` | Tap Time Widget |
| **Pause / Resume** | `Escape` | `⏸` Button |

### Custom Key Binding System
Access **Settings → Key Bindings** from the Title Screen or Pause Menu:
- Click any action pill to enter **Key Capture Mode**.
- Press any valid keyboard key to rebind.
- Automatic conflict detection warns if a key is already assigned to another action.
- Browser-reserved keys (`F1`–`F12`, `Meta`/`Cmd`) are protected.
- Press `Escape` during capture to cancel.
- **Reset Controls** restores all defaults without erasing game progress.
- Preferences are saved independently to `heiwa_keybindings_v1`.

### Vehicle Controls
- `W` / `Arrow Up`: Accelerate forward
- `S` / `Arrow Down`: Brake / Reverse
- `A` / `Arrow Left`: Steer left
- `D` / `Arrow Right`: Steer right
- `Space`: Handbrake
- `E`: Exit vehicle

---

## 📱 Mobile Support & Fullscreen Architecture

HEIWA includes a mobile architecture designed for smartphones and tablets:

```
┌─────────────────────────────────────────────────────────────┐
│ [Minimap]  [Location]                       [Time]  [Pause] │
│                                                             │
│                                                             │
│    ┌──────────┐                                             │
│    │ Virtual  │               [ Touch Look ]       (JOG)    │
│    │ Joystick │                 Drag Area                   │
│    │ └────────┘                                    (ACTION) │
│                                                     (JUMP)  │
└─────────────────────────────────────────────────────────────┘
```

### Orientation Detection & Portrait Alert
- When opened in **Portrait mode** on a mobile device, HEIWA displays an orientation blocker instructing the user to rotate to landscape:
  > *"Please rotate your device to landscape to play HEIWA."*
- Gameplay input, camera movement, and physics are safely paused during portrait display.

### User-Activated Fullscreen Flow & Android Chrome
- **Browser Security Rules**: Modern mobile browsers (including Android Chrome) require fullscreen requests to originate directly from a trusted user activation (touch/click). Asynchronous events like `orientationchange` or `resize` cannot invoke `requestFullscreen()` automatically without throwing browser security exceptions.
- **One-Tap Fullscreen Activation**: When the device rotates into landscape on fullscreen-capable browsers, HEIWA transitions the overlay to show a single **`ENTER FULLSCREEN`** button.
- Tapping the button directly invokes the Fullscreen API on the root `#game-container`, enters true browser fullscreen (`document.fullscreenElement !== null`), and unlocks gameplay.

### iOS Safari Full-Viewport Fallback
- Apple's WebKit on iPhone Safari does not support the Fullscreen API on arbitrary DOM elements (`document.fullscreenEnabled` is false).
- HEIWA automatically detects this capability state via `FullscreenManager` and smoothly bypasses the fullscreen button, transitioning directly into a full-viewport landscape experience (`100dvw` × `100dvh` with `viewport-fit=cover` and notch `env(safe-area-inset-*)` padding).

### Touch Controls & Virtual Joystick
- **Virtual Joystick**: Floating thumbstick on the lower-left for analog walking and jogging.
- **Touch Camera Look**: Dedicated swipe area on the right half of the display for 360-degree orbital camera control.
- **Action Touch Buttons**: Ergonomic circular touch buttons for `JUMP` (`Space`), `ACTION` (`E`), `RUN` / `JOG` (`Shift`), and `PAUSE` (`⏸`).
- **Manual Fullscreen Exit Safety**: If the player manually exits fullscreen while remaining in landscape, gameplay continues uninterrupted without triggering fullscreen request loops.

---

## 🔊 Procedural Audio & Atmosphere

HEIWA uses the browser **Web Audio API** to synthesize procedural ambient soundscapes without external audio file loading overhead:

- **Atmospheric Wind**: Pink-noise generator shaped with dynamic low-pass filters responding to open areas.
- **Suburban Hum**: Dual low-frequency sine oscillators mimicking distant city ambience.
- **Store Resonance**: High-frequency harmonic hum inside HIKARI MART reflecting convenience store lighting.
- **Parametric Birdsong**: Randomized frequency chirps triggering during morning and midday hours.
- **Footsteps**: Procedural noise bursts timed to walking and jogging gait cycles.
- **Audio Mute Toggle**: Ambience can be toggled on/off at any time in the Pause Menu or Settings.

---

## 🎨 Visual Direction & Aesthetics

- **Color Palette**: Curated pastel-suburban palette inspired by contemporary Japanese animation.
- **Procedural Particle Effects**: Soft pink Sakura blossoms drifting across the town with gentle wind physics.
- **Architectural Authenticity**: Proportionally accurate detached homes, hipped tile roofs, balcony railings, siding panels, vending kiosks, and Japanese road infrastructure.
- **Typography**: Clean, modern typography using Google Fonts (**Plus Jakarta Sans**).

---

## 🏗️ Technical Architecture

HEIWA follows a decoupled, event-driven Entity-Component-System (ECS) inspired architecture:

```
                              ┌────────────────────┐
                              │     main.js        │
                              │ (Bootstrap & Game) │
                              └─────────┬──────────┘
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
               ┌──────────────────┐          ┌───────────────────┐
               │    Engine.js     │          │   TouchControls   │
               │ (Render/TickLoop)│          │ (Mobile Gestures) │
               └─────────┬────────┘          └───────────────────┘
                         │
     ┌───────────────────┼───────────────────┬───────────────────┐
     ▼                   ▼                   ▼                   ▼
┌───────────────┐ ┌───────────────┐ ┌─────────────────┐ ┌───────────────┐
│ PlayerSystem  │ │ VehicleSystem │ │ WorldStreaming  │ │  WorldSystem  │
│ (Kinematics)  │ │   (Driving)   │ │ (Chunk Loader)  │ │ (Environment) │
└───────┬───────┘ └───────┬───────┘ └────────┬────────┘ └───────┬───────┘
        │                 │                  │                  │
        └─────────────────┼──────────────────┴──────────────────┘
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
        ┌───────────────┐   ┌───────────────┐
        │   EventBus    │   │  SaveSystem   │
        │ (Global Pub/  │   │ (localStorage │
        │    Sub Hub)   │   │  Persistence) │
        └───────┬───────┘   └───────────────┘
                │
     ┌──────────┼──────────┬──────────┬──────────┐
     ▼          ▼          ▼          ▼          ▼
┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
│CameraSys││ NPCSystem││QuestSys ││UISystem ││AudioSys │
└─────────┘└─────────┘└─────────┘└─────────┘└─────────┘
```

### Key Subsystems
- **`Engine`**: Manages the Three.js `WebGLRenderer`, camera setup, render loop, and system update ordering.
- **`EventBus`**: Centralized event bus enabling zero-coupling communication across systems (`player:moved`, `time:updated`, `game:reset`, etc.).
- **`GameStateManager`**: Authoritative finite state machine managing states: `TITLE`, `LOADING`, `PLAYING`, `PAUSED`, and `GAME_OVER`.
- **`InputManager`**: Unified keyboard, mouse, pointer lock, and custom keybinding processor.
- **`SaveSystem`**: Complete serialize/deserialize pipeline for persistent browser saves.
- **`FullscreenManager`**: Centralized, cross-browser Fullscreen API capability detection and request utility.

---

## 📁 Project Directory Structure

```
HEIWA/
├── .gitignore                      # Git ignore patterns (node_modules, dist, etc.)
├── index.html                      # Primary HTML5 entry point & semantic UI modals
├── package.json                    # Dependencies, scripts, and engine specifications
├── package-lock.json               # Locked dependency tree
├── README.md                       # Comprehensive project documentation
├── vercel.json                     # Vercel static deployment configuration
├── vite.config.js                  # Vite build, preview, and chunk splitting configuration
│
├── public/                         # Static public assets
│   ├── favicon.png                 # Raster favicon fallback
│   └── favicon.svg                 # SVG favicon badge
│
├── src/                            # Game source code
│   ├── main.js                     # Bootstrap entry, system registration, error boundary
│   ├── style.css                   # Complete responsive styling & animation system
│   │
│   ├── engine/                     # Core engine infrastructure
│   │   ├── Engine.js               # Three.js scene manager & frame loop
│   │   ├── EventBus.js             # Publish-subscribe event bus
│   │   ├── GameStateManager.js     # Finite state machine (TITLE, PLAYING, etc.)
│   │   ├── InputManager.js         # Unified input, mouse-look & key capture
│   │   ├── KeyBindings.js          # Rebindable key definitions, formatters & storage
│   │   ├── SaveSystem.js           # Atomic localStorage auto-save/resume/reset
│   │   └── TouchControls.js        # Mobile virtual joystick & orientation manager
│   │
│   ├── entities/                   # Game entities
│   │   └── VehicleSystem.js        # Mayank's car kinematics, 4-point suspension & driving
│   │
│   ├── systems/                    # Core gameplay subsystems
│   │   ├── AudioSystem.js          # Web Audio procedural soundscapes & ambience
│   │   ├── CameraSystem.js         # Third-person follow camera & mouse look
│   │   ├── InteractionSystem.js    # Contextual radius detection & prompts
│   │   ├── NPCSystem.js            # 10 district residents, schedules & dialogues
│   │   ├── PlayerSystem.js         # Kinematics, walking/jogging/jumping & animation
│   │   ├── QuestSystem.js          # "Morning Errand" progression tracker
│   │   ├── UISystem.js             # HUD, minimap canvas, modals, Settings/Credits UI
│   │   ├── WaypointNetwork.js      # District navigation graph & pathfinding
│   │   └── WorldSystem.js          # Authored district assembly, lighting & collision
│   │
│   ├── world/                      # World generation & streaming
│   │   ├── BuildingGenerator.js    # Procedural Japanese architectural generator
│   │   ├── StreetPropsGenerator.js # Utility poles, vending machines & props
│   │   └── WorldStreamingSystem.js # Deterministic infinite chunk streaming
│   │
│   ├── utils/                      # Utilities & mathematics
│   │   ├── FullscreenManager.js    # Fullscreen API helper & capability detection
│   │   ├── ProceduralTextures.js   # Canvas-generated procedural textures
│   │   └── SeededRandom.js         # Deterministic PRNG, noise & elevation maths
│   │
│   └── testing/                    # Automated testing suite
│       ├── AutoTestController.js   # Programmatic agent control interface
│       └── AutoTestRunner.js       # 18-part in-browser automated test runner
│
└── scripts/                        # Headless verification & test scripts
    ├── generate_favicon_png.js     # Favicon build tool
    ├── run_autotest_audit.js       # Architecture & language audit (`npm test`)
    ├── test_autosave_resume.js     # Save/resume validation suite
    ├── test_begin_hitbox.js        # UI hitbox & pointer audit
    ├── test_car_exit_procedural.js # Vehicle coordinate exit verification
    ├── test_collision_resolution.js# Collision physics test suite
    ├── test_credits_modal.js       # Credits modal & GitHub link verification
    ├── test_day_cycle_key.js       # Time advancement key verification
    ├── test_free_mouselook.js      # Mouse-look regression test
    ├── test_key_bindings.js        # Custom keybindings test suite
    ├── test_minimap_aaa.js         # Minimap toggle & direction test
    ├── test_mobile_orientation_fullscreen.js # Mobile fullscreen & orientation test suite
    ├── test_modal_layering.js      # UI z-index & modal safety test
    ├── test_mouselook_behavior.js  # Camera behavior verification
    ├── test_reset_game_flow.js     # Settings Reset Game flow test
    ├── test_startup.js             # Headless startup simulation test
    ├── test_streaming_and_vehicle.js# Procedural streaming & car tests
    ├── test_touch_camera.js        # Mobile touch camera test
    └── test_vehicle_pitch_grounding.js # 4-point ground probing test
```

---

## 💻 Technology Stack

- **Runtime Environment**: Modern Web Browsers (Chrome, Firefox, Safari, Edge)
- **Engine / Graphics**: [Three.js](https://threejs.org/) (`^0.170.0`) / WebGL
- **Bundler & Build Tool**: [Vite](https://vitejs.dev/) (`^6.0.0`)
- **Language**: JavaScript (ES Modules, Strict Mode)
- **Styling**: Vanilla CSS3 (Custom properties, Glassmorphism, Flexbox, Grid)
- **Audio Engine**: Web Audio API (Native browser synthesis)
- **Storage**: Web Storage API (`localStorage`)
- **Package Manager**: npm (`Node.js >= 18.0.0`)

---

## 🚦 Current Production Status

### Implemented & Verified
- [x] **Third-Person Locomotion**: Camera-relative movement, jogging, jumping, sitting on benches.
- [x] **Authored District (Sakuragaoka)**: Complete town with Sakura Heights, HIKARI MART, Sakuragaoka Park, streets, utility networks, and vending stations.
- [x] **Solid Collision Resolution**: Axis-decoupled substepping wall-sliding physics across all buildings, walls, and props.
- [x] **Living NPC Simulation**: 10 distinct residents with 24-hour schedules, waypoint pathfinding, and interactive dialogues.
- [x] **Introductory Questline**: "The Morning Errand" quest sequence with HUD objective tracking.
- [x] **Procedural Open World**: Deterministic multi-zone world generation (Suburban, Farmland, Woodland) with elevation math.
- [x] **Dynamic Chunk Streaming**: 500m × 500m active grid with velocity-aware car preloading and memory disposal.
- [x] **Physical Kei Car**: 4-point terrain ground probing, realistic chassis pitch, steering, braking, and exact-coordinate exit.
- [x] **Atmospheric Day/Night Cycle**: 24-hour solar arc with lighting transitions and `[T]` manual time step.
- [x] **HUD & Minimap**: Minimap radar with player orientation chevron and `[M]` toggleable expanded view.
- [x] **Auto-Save / Resume / Reset**: Multi-trigger `localStorage` persistence with confirmation-protected Reset Game.
- [x] **Custom Key Bindings**: Rebindable keyboard controls with conflict detection, reserved key protection, and independent storage.
- [x] **Mobile Orientation & Fullscreen**: Landscape enforcement overlay, 1-tap user-activated fullscreen (Android Chrome), and full-viewport fallback (iOS Safari).
- [x] **In-Game Credits & About**: Dedicated informational screens crediting Creator Mayank Suthar, GitHub, Antigravity, and ChatGPT.
- [x] **Procedural Audio Engine**: Web Audio synthesis for wind, suburban ambience, store hum, birdsong, and footstep cadence.
- [x] **Production Build & Vercel Readiness**: Zero localhost dependencies, pure static SPA output in `dist/`.

---

## 🚀 Getting Started & Development Setup

### Prerequisites
- **Node.js**: Version `18.0.0` or higher installed
- **Web Browser**: Modern browser with WebGL support enabled

### 1. Clone & Install
```bash
# Clone the repository
git clone https://github.com/mayankkkksss/Heiwa.git
cd Heiwa

# Install dependencies
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to start playing with hot module reloading.

---

## 📜 Available Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Starts Vite local development server at `http://localhost:3000` |
| `npm run build` | Compiles and optimizes production assets into `dist/` |
| `npm run preview` | Runs local HTTP preview server for `dist/` bundle at `http://localhost:4173` |
| `npm test` | Runs the language rule audit and system architecture test suite |
| `node scripts/test_mobile_orientation_fullscreen.js` | Runs mobile orientation & fullscreen transition verification |
| `node scripts/test_startup.js` | Runs headless full-pipeline startup simulation & AutoTestRunner |
| `node scripts/test_reset_game_flow.js` | Runs the Settings Reset Game verification test suite |
| `node scripts/test_autosave_resume.js` | Runs the save/resume persistence test suite |
| `node scripts/test_key_bindings.js` | Runs the custom key bindings verification suite |
| `node scripts/test_credits_modal.js` | Runs the in-game Credits modal verification test |

---

## 🌐 Production Build & Vercel Deployment

HEIWA is a static client-side single-page application configured for zero-configuration deployment on [Vercel](https://vercel.com/):

### Vercel Configuration (`vercel.json`)
```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

### Deployment Steps
1. Push your code to your GitHub repository ([https://github.com/mayankkkksss/Heiwa](https://github.com/mayankkkksss/Heiwa)).
2. Import the repository in the **Vercel Dashboard**.
3. Vercel automatically selects the **Vite** preset:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Click **Deploy**. The game is compiled and distributed globally via Vercel's Edge CDN.

---

## 🧪 Testing & Quality Assurance

HEIWA includes an automated verification suite:

### 1. In-Browser Autonomous Test Suite (`AutoTestRunner`)
Launch the game with `?autotest=1` (e.g. `http://localhost:3000/?autotest=1`) to run 18 automated integration tests:
- Engine & Game Loop Stability
- Player Kinematics & Jump Physics
- Solid Collision & De-penetration
- Bench Seating & State Transitions
- NPC Locomotion & Schedule Evaluation
- Dialogue System & Quest State
- Minimap Rendering & Direction
- Audio System Initialization
- World Streaming & Car Physics
- Strict Language Compliance

### 2. Headless Node.js Test Suite
Run tests locally without launching a browser:
```bash
# Architecture & language audit
npm test

# Mobile orientation & fullscreen verification
node scripts/test_mobile_orientation_fullscreen.js

# Full startup & subsystem simulation
node scripts/test_startup.js

# Specific unit & system tests
node scripts/test_reset_game_flow.js
node scripts/test_autosave_resume.js
node scripts/test_key_bindings.js
node scripts/test_streaming_and_vehicle.js
node scripts/test_credits_modal.js
```

---

## ⚡ Performance & Optimization

- **Chunk Culling & Distance Streaming**: Only 25 chunks (500m × 500m) exist in memory simultaneously; distant chunks are automatically unmounted.
- **Shared Geometries & Materials**: Reusable materials for terrain, roads, guardrails, and buildings drastically reduce GPU draw calls.
- **Zero Runtime Garbage Collection**: Vectors, matrices, and rays are pre-allocated in modules to eliminate memory churn during the 60fps render loop.
- **Procedural Canvas Textures**: Textures (asphalt, roof tiles, tatami, wood siding) are generated programmatically at startup, avoiding network asset downloads.
- **Spatial Grid Collision Partitioning**: Colliders are indexed into spatial grid cells (`12m` cell size) for O(1) broadphase collision lookups.

---

## 🔍 Browser Compatibility & Troubleshooting

### Compatibility
- **Desktop**: Chrome 90+, Edge 90+, Firefox 88+, Safari 15+
- **Mobile**: Android Chrome, iOS Safari (iOS 15+)
- **WebGL**: Requires WebGL 1.0 or WebGL 2.0 with hardware acceleration enabled.

### Troubleshooting
- **Mobile Fullscreen & Orientation**:
  - *Android Chrome*: When rotating to landscape, tap **"ENTER FULLSCREEN"** to grant user-activation permission to enter full-screen mode.
  - *iOS Safari (iPhone)*: Apple WebKit does not support Fullscreen API on standard DOM elements. HEIWA automatically falls back to full-viewport landscape with notch safe-area insets.
- **Blank Screen / Startup Error**: Ensure hardware acceleration is enabled in browser settings (`chrome://settings/system`).
- **Audio Not Playing**: Browsers require a user gesture (click, keypress, or tap) before allowing Web Audio playback. Audio starts automatically on your first interaction.
- **Resetting Saved Data**: Open **Settings → Reset Game** and click **Reset**, or clear browser site data for the domain.
- **Vercel Preview Testing**: Run `npm run build && npm run preview` locally to test the exact production bundle before deploying.

---

## 📜 Development Guidelines & Language Rule

### Strict Language Rule
> **The ONLY Japanese text permitted anywhere in HEIWA is:**
> 
> # 平和
> 
> Everything else—including UI text, HUD labels, dialogues, quest logs, menus, settings, button labels, signs, debug output, and documentation—must strictly be in English.

---

## 🌸 Credits

### Creator & Developer
- **Mayank Suthar**
- **GitHub**: [https://github.com/mayankkkksss/](https://github.com/mayankkkksss/)

### Development Tools & AI Assistance
- **Antigravity** — Used for coding and implementation.
- **ChatGPT** — Used for prompting and AI-assisted development guidance.

### Technologies & Libraries
- **Three.js** — 3D WebGL graphics engine
- **Vite** — Next generation frontend tooling
- **Plus Jakarta Sans** — Typography by Tokotype

---

**HEIWA (平和) — A peaceful, mindful journey through everyday Japan.**