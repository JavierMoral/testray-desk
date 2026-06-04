import { getRoutineBuilds } from '@/services/build'
import { getBuildCaseResults } from '@/services/case-result'
import fs from 'node:fs'
import path from 'node:path'

import { inheritMetadata } from '@/lib/inherit-metadata'
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

	const [lastBuild, previousDayBuild] = await getRoutineBuilds({
		routineId: routine.routineId,
		limit: 2,
	})

	if (!lastBuild) {
		process.stdout.write('false')

		return
	}

	if (readLastReportedBuildId(routineKey) === lastBuild.id) {
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

	for (const caseResult of caseResults) {
		await inheritMetadata(previousDayIssues, caseResult)
	}

	writeLastReportedBuildId(routineKey, lastBuild.id)
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
