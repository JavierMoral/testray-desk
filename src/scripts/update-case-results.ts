import { getRoutineBuilds } from '@/services/build'
import { getBuildCaseResults } from '@/services/case-result'
import fs from 'node:fs'
import path from 'node:path'

import { inheritMetadata } from '@/lib/inherit-metadata'
import { ROUTINES } from '@/lib/routines'

import { Build, Routine } from '@/types/testray'

const LAST_REPORTED_BUILD_ID_FILE = path.join(
	process.cwd(),
	'.last-reported-build-id'
)

function readLastReportedBuildId(): Build['id'] | null {
	try {
		const content = fs
			.readFileSync(LAST_REPORTED_BUILD_ID_FILE, 'utf-8')
			.trim()
		const id = Number(content)

		return Number.isFinite(id) ? id : null
	} catch {
		return null
	}
}

function writeLastReportedBuildId(id: Build['id']): void {
	fs.writeFileSync(LAST_REPORTED_BUILD_ID_FILE, String(id))
}

async function updateCaseResults(routineId: Routine['id']) {
	const [lastBuild, previousDayBuild] = await getRoutineBuilds({
		routineId,
		limit: 2,
	})

	if (!lastBuild) {
		process.stdout.write('false')

		return
	}

	if (readLastReportedBuildId() === lastBuild.id) {
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

	writeLastReportedBuildId(lastBuild.id)
}

async function main() {
	await Promise.all(
		Object.values(ROUTINES).map((routine) =>
			updateCaseResults(routine.routineId)
		)
	)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
