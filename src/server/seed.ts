import { count } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  announcements,
  calendarEvents,
  departmentMemberships,
  departmentRecords,
  departments,
  integrationConfigs,
  projects,
  storyEntries,
  tasks,
  users,
} from '../db/schema.ts';
import { OFFICIAL_DEPARTMENTS } from '../data/officialDepartments.ts';
import { OFFICIAL_DIRECTOR_EMAIL, OFFICIAL_DIRECTOR_PHONE } from './services/notificationService.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureStudioSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

async function runSeed(): Promise<void> {
  // Always ensure the 10 official departments exist with exact IDs & prefixes
  for (const dept of OFFICIAL_DEPARTMENTS) {
    await db
      .insert(departments)
      .values({
        id: dept.id,
        prefix: dept.prefix,
        name: dept.name,
        tagline: dept.tagline,
        description: dept.description,
        suggestedTools: dept.suggestedTools,
        modules: dept.modules,
        isOfficial: true,
        sortOrder: dept.sortOrder,
      })
      .onConflictDoNothing({ target: departments.id });
  }

  // Ensure Founder & Director record exists (binds automatically to Firebase UID on Google sign-in)
  const existingUsers = await db.select({ value: count() }).from(users);
  if ((existingUsers[0]?.value ?? 0) === 0) {
    const [director] = await db
      .insert(users)
      .values({
        uid: 'pending-director-mj',
        memberId: 'EV-DIR-001',
        email: OFFICIAL_DIRECTOR_EMAIL.toLowerCase(),
        fullName: 'M.J. Mujesh Dharshan',
        role: 'DIRECTOR',
        status: 'ACTIVE',
        phone: OFFICIAL_DIRECTOR_PHONE,
        bio: "Founder & Director of Elder'sVeil Anime Studio — Stories Beyond Imagination.",
        skills: ['Direction', 'Story Architecture', 'Worldbuilding', 'Anime Production'],
      })
      .onConflictDoNothing()
      .returning();

    if (director) {
      // Assign Director as oversight across official departments
      for (const dept of OFFICIAL_DEPARTMENTS) {
        await db
          .insert(departmentMemberships)
          .values({
            userId: director.id,
            departmentId: dept.id,
            deptRole: 'HEAD',
            assignedByUserId: director.id,
          })
          .onConflictDoNothing();
      }

      // Seed default integration metadata (never storing secrets in DB)
      await db
        .insert(integrationConfigs)
        .values([
          {
            key: 'studio_profile',
            config: {
              studioName: "Elder'sVeil Anime Studio",
              founderDirector: 'M.J. Mujesh Dharshan',
              tagline: 'Stories Beyond Imagination',
              officialDepartmentsCount: 10,
              directorNotificationEmail: OFFICIAL_DIRECTOR_EMAIL,
              directorNotificationPhone: OFFICIAL_DIRECTOR_PHONE,
            },
            updatedByUserId: director.id,
          },
          {
            key: 'email_settings',
            config: {
              smtpHost: 'smtp.gmail.com',
              smtpPort: 465,
              smtpSecure: true,
              smtpFrom: `Elder'sVeil Anime Studio <${OFFICIAL_DIRECTOR_EMAIL}>`,
              recipientEmail: OFFICIAL_DIRECTOR_EMAIL,
            },
            updatedByUserId: director.id,
          },
          {
            key: 'sms_settings',
            config: {
              provider: 'TWILIO',
              recipientPhone: OFFICIAL_DIRECTOR_PHONE,
              msg91SenderId: 'ELDRVL',
            },
            updatedByUserId: director.id,
          },
          {
            key: 'whatsapp_settings',
            config: {
              enabled: false,
              mode: 'OFFICIAL_WHATSAPP_BUSINESS_CLOUD_API',
              recipientPhone: OFFICIAL_DIRECTOR_PHONE,
            },
            updatedByUserId: director.id,
          },
          {
            key: 'security_settings',
            config: {
              maxUploadMb: 10,
              requireEmailAndTrackingCode: true,
              rateLimitWindowMinutes: 15,
              enforceRbacBackend: true,
            },
            updatedByUserId: director.id,
          },
        ])
        .onConflictDoNothing();

      // Seed initial flagship cross-department anime project
      const [project] = await db
        .insert(projects)
        .values({
          code: 'EV-PRJ-001',
          title: 'Chronicles of the Shattered Veil — Episode 01 Pilot',
          description:
            'Flagship cross-department anime production uniting feudal Samurai clans, covert Shinobi guilds, Maritime Corsair fleets, and Arcane Covens under one unified story pipeline.',
          leaderUserId: director.id,
          primaryDepartmentId: 'animation',
          departmentIds: [
            'samurai',
            'ninja',
            'martial-arts',
            'pirate',
            'explorer',
            'witches-wizards',
            'story',
            'animation',
            'audio',
            'video',
          ],
          priority: 'HIGH',
          productionStage: 'STAGE_2_STORY',
          status: 'ACTIVE',
          progress: 28,
          startDate: '2026-11-01',
          deadline: '2027-02-15',
          milestones: [
            { id: 'ms-1', title: 'Worldbuilding & Clan Canon Lock', dueDate: '2026-11-30', completed: true },
            { id: 'ms-2', title: 'Episode 01 Script & Storyboard Handoff', dueDate: '2026-12-20', completed: false },
            { id: 'ms-3', title: 'Key Animation & OST Demo Review', dueDate: '2027-01-25', completed: false },
          ],
          dependencies: ['Stage 1 Lore Lock -> Stage 2 Script Lock -> Stage 4 Storyboard Cuts'],
          createdByUserId: director.id,
        })
        .onConflictDoNothing()
        .returning();

      if (project) {
        // Seed initial Story Entry (Universe -> Saga -> Arc -> Volume -> Chapter -> Scene)
        const [story] = await db
          .insert(storyEntries)
          .values({
            projectId: project.id,
            departmentId: 'story',
            universe: "Elder'sVeil Core Universe",
            saga: 'Saga I: The Veiled Shogunate',
            arc: 'Arc 1: Crimson Mist Over Kurogane',
            volume: 'Volume 1: Blades of Twilight',
            chapterNumber: 1,
            chapterTitle: 'The Ronin at the Cedar Gate',
            sceneNumber: 1,
            scriptText:
              'EXT. KUROGANE CEDAR GATE — DUSK\n\nMist curls over weathered basalt steps. KENJIRO (26), a wandering Ronin bearing a chipped wakizashi and wrapped nodachi, pauses beneath a torn clan banner.\n\nKENJIRO\n(low, measured)\nThe gate was sealed three winters ago. Yet the lantern oil is still warm.\n\nFrom the pine ridge above, a silent SHINOBI OBSERVER adjusts an obsidian spyglass and vanishes into the canopy.',
            dialogueNotes: 'Deliver Kenjiro lines with quiet restraint; leave 1.5s ambient wind pause before the Shinobi cut.',
            continuityNotes: 'Kenjiro right-sleeve mon crest is partially torn—matches Samurai Department clan sheet SAM-CLAN-01.',
            authorUserId: director.id,
            status: 'APPROVED',
            revisionNumber: 1,
            revisionHistory: [
              {
                revision: 1,
                editedBy: 'M.J. Mujesh Dharshan',
                note: 'Initial pilot scene canon lock',
                timestamp: new Date().toISOString(),
              },
            ],
          })
          .returning();

        // Seed initial Samurai Historical vs Fictional reference entries (Katana, Wakizashi, Nodachi, Tanto, Kenjutsu, Iaido, Battōjutsu)
        await db.insert(departmentRecords).values([
          {
            departmentId: 'samurai',
            moduleKey: 'katana_weapon_db',
            title: 'Uchigatana / Katana (Historical Reference)',
            classification: 'HISTORICAL',
            summary:
              'Curved, single-edged blade worn edge-up in the obi; standard Edo-period samurai sidearm paired with the wakizashi as a daishō.',
            metadata: {
              'Weapon Class': 'Katana (Daitō)',
              'Blade Length': '60–73 cm (2–2.4 shaku)',
              'Smith / Forge': 'Traditional Tamahagane fold',
              Curvature: 'Sori ~1.5 cm',
            },
            projectId: project.id,
            linkedStoryEntryId: story?.id ?? null,
            createdByUserId: director.id,
          },
          {
            departmentId: 'samurai',
            moduleKey: 'katana_weapon_db',
            title: 'Wakizashi, Nodachi & Tanto Arsenal Guide',
            classification: 'HISTORICAL',
            summary:
              'Historical specifications distinguishing the indoor companion Wakizashi (30–60 cm), battlefield Great Sword Nodachi (90+ cm), and concealed dagger Tanto (<30 cm).',
            metadata: {
              'Weapon Class': 'Wakizashi / Nodachi / Tanto',
              'Blade Length': '15–120 cm spectrum',
              'Primary Role': 'Indoor duel / anti-cavalry / close-quarters',
              'Fact vs Fiction': 'Historical baseline for studio weapon scaling',
            },
            projectId: project.id,
            linkedStoryEntryId: story?.id ?? null,
            createdByUserId: director.id,
          },
          {
            departmentId: 'samurai',
            moduleKey: 'swordsmanship_library',
            title: 'Kenjutsu, Iaido & Battōjutsu Reference Forms',
            classification: 'HISTORICAL',
            summary:
              'Classical Japanese swordsmanship pillars: Kenjutsu (paired blade combat), Iaido (fluid meditative draw-and-cut), and Battōjutsu (combative rapid-draw strikes).',
            metadata: {
              Discipline: 'Kenjutsu / Iaido / Battōjutsu',
              Stance: 'Chūdan-no-kamae / Seigan',
              'Draw Timing': 'Single-motion nukitsuke',
              'Continuity Status': 'Verified Historical Baseline',
            },
            projectId: project.id,
            linkedStoryEntryId: story?.id ?? null,
            createdByUserId: director.id,
          },
          {
            departmentId: 'samurai',
            moduleKey: 'swordsmanship_library',
            title: 'Kurogane Crescent Draw (Original Studio Style)',
            classification: 'FICTIONAL',
            summary:
              'Original fictional Battōjutsu variation created for Kenjiro: uses an inverted saya scabbard angle to deflect incoming shinobi projectiles mid-draw.',
            metadata: {
              Discipline: 'Original Fictional Battōjutsu',
              Stance: 'Low reverse-grip saya guard',
              'Draw Timing': '6-frame flash draw (24fps)',
              'Continuity Status': 'Fictional — Episode 01 Signature Move',
            },
            projectId: project.id,
            linkedStoryEntryId: story?.id ?? null,
            createdByUserId: director.id,
          },
          {
            departmentId: 'witches-wizards',
            moduleKey: 'magical_rules_limits',
            title: 'Law of Veil Resonance (Magic Constraint)',
            classification: 'ORIGINAL',
            summary:
              'Every high-circle spell drains ambient spirit ink; casting beyond three consecutive sigils fractures the caster’s shadow focus.',
            metadata: {
              Rule: 'Conservation of Veil Ink',
              'Prohibited Action': 'Zero-cost teleportation across oceans',
              'Narrative Reason': 'Preserves maritime Pirate & Explorer voyage stakes',
              Exceptions: 'Astral Leyline Convergences',
            },
            projectId: project.id,
            linkedStoryEntryId: story?.id ?? null,
            createdByUserId: director.id,
          },
          {
            departmentId: 'animation',
            moduleKey: 'shot_management',
            title: 'EP01-SC01-SH004 — Cedar Gate Fog Reveal',
            classification: 'PRODUCTION',
            summary:
              'Slow multi-plane camera crane pushing through cedar branches onto Kenjiro silhouette at dusk.',
            metadata: {
              'Shot ID': 'EP01-SC01-SH004',
              Frames: '144 frames (6.0s)',
              FPS: '24 fps',
              'Render Status': 'Layout Approved — Ready for Genga',
            },
            projectId: project.id,
            linkedStoryEntryId: story?.id ?? null,
            createdByUserId: director.id,
          },
        ]);

        // Initial Tasks & Calendar Milestone & Studio Announcement
        await db.insert(tasks).values([
          {
            projectId: project.id,
            departmentId: 'samurai',
            assigneeUserId: director.id,
            createdByUserId: director.id,
            title: 'Finalize Kurogane Clan Mon & Nodachi Proportions',
            description: 'Deliver orthographic weapon scale sheet and clan emblem SVG for Animation prop handoff.',
            priority: 'HIGH',
            status: 'IN_PROGRESS',
            deadline: '2026-12-05',
          },
          {
            projectId: project.id,
            departmentId: 'animation',
            assigneeUserId: director.id,
            createdByUserId: director.id,
            title: 'Complete Episode 01 Opening 12 Storyboard Panels',
            description: 'Block camera movement from Cedar Gate mist intro to Shinobi ridge reveal.',
            priority: 'HIGH',
            status: 'TODO',
            deadline: '2026-12-15',
          },
        ]);

        await db.insert(calendarEvents).values([
          {
            title: 'Episode 01 Cross-Department Storyboard Review',
            description: 'Director & Department Heads review aligned Story, Samurai, Ninja, and Animation handoffs.',
            eventType: 'STUDIO',
            projectId: project.id,
            startsAt: '2026-12-10T10:00',
            endsAt: '2026-12-10T11:30',
            createdByUserId: director.id,
          },
          {
            title: 'Episode 01 Pilot Deadline',
            description: 'Target completion for Pilot assembly & Director final QC screening.',
            eventType: 'DEADLINE',
            projectId: project.id,
            startsAt: '2027-02-15T18:00',
            createdByUserId: director.id,
          },
        ]);

        await db.insert(announcements).values({
          title: "Welcome to Elder'sVeil Anime Studio Ecosystem",
          body: 'All ten official departments (Samurai/Ronin, Ninja, Martial Arts, Pirate, Explorer, Witches & Wizards, Animation, Story/Writing, Audio/Music, and Video/Production) are unified under our shared PostgreSQL production workspace. Submit creative briefs, track tasks, and link assets directly to active episode pipelines.',
          scope: 'STUDIO',
          authorUserId: director.id,
          pinned: true,
        });
      }
    }
  }
}
