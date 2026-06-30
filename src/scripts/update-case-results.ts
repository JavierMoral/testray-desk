import { getRoutineBuilds } from '@/services/build'
import { getBuildCaseResults } from '@/services/case-result'
import fs from 'node:fs'
import path from 'node:path'

import { inheritMetadata } from '@/lib/inherit-metadata'
import {
	computeSkippedBuildIds,
	logEvent,
	snapshot,
	startRun,
} from '@/lib/page-management-audit'
import { ROUTINES } from '@/lib/routines'

import { Build } from '@/types/testray'

function getLastReportedBuildIdFile(routineKey: string): string {
	return path.join(process.cwd(), `.last-reported-build-id-${routineKey}`)
}

function readLastReportedBuildId(routineKey: string): Build['id'] | null {
	try {
		const id = Number(
			fs
				.readFileSync(getLastReportedBuildIdFile(routineKey), 'utf-8')
				.trim()
		)

		return Number.isFinite(id) ? id : null
	} catch {
		return null
	}
}

function writeLastReportedBuildId(routineKey: string, id: Build['id']): void {
	fs.writeFileSync(getLastReportedBuildIdFile(routineKey), String(id))
}

async function updateCaseResults(routineKey: string) {
	const routine = ROUTINES[routineKey]

	const audit = startRun(routine.routineId, 'cron')

	const [lastBuild, previousDayBuild] = await getRoutineBuilds({
		routineId: routine.routineId,
		limit: 2,
	})

	if (!lastBuild) {
		await logEvent(audit, 'build.select', { skipped: 'no-build' })

		process.stdout.write('false')

		return
	}

	const lastReportedBuildId = readLastReportedBuildId(routineKey)

	if (audit) {
		audit.lastBuildId = lastBuild.id
		audit.previousBuildId = previousDayBuild?.id

		const recentBuildIds = (
			await getRoutineBuilds({ routineId: routine.routineId, limit: 10 })
		).map((build) => build.id)

		await logEvent(audit, 'build.select', {
			lastBuildId: lastBuild.id,
			lastBuildDate: lastBuild.dateCreated,
			previousBuildId: previousDayBuild?.id ?? null,
			previousBuildDate: previousDayBuild?.dateCreated ?? null,
			previousBuildMissing: !previousDayBuild,
			recentBuildIds,
			lastReportedBuildId,
			skippedBuildIds: computeSkippedBuildIds(
				recentBuildIds,
				lastReportedBuildId
			),
		})
	}

	if (lastReportedBuildId === lastBuild.id) {
		await logEvent(audit, 'inherit.skip', {
			reason: 'already-reported',
			lastBuildId: lastBuild.id,
		})

		process.stdout.write('false')

		return
	}

	const previousDayIssues = await getBuildCaseResults({
		buildId: previousDayBuild.id,
		statuses: ['FAILED', 'BLOCKED', 'UNTESTED'],
	})

	const caseResults = await getBuildCaseResults({
		buildId: lastBuild.id,
		statuses: ['FAILED', 'BLOCKED', 'UNTESTED'],
	})

	await snapshot(audit, previousDayBuild.id, previousDayIssues)
	await snapshot(audit, lastBuild.id, caseResults)

	for (const caseResult of caseResults) {
		await inheritMetadata(previousDayIssues, caseResult, audit)
	}

	writeLastReportedBuildId(routineKey, lastBuild.id)

	await logEvent(audit, 'run.done', {
		lastBuildId: lastBuild.id,
		caseResultCount: caseResults.length,
	})
}

async function main() {
	await Promise.all(
		Object.keys(ROUTINES).map((routineKey) => updateCaseResults(routineKey))
	)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
