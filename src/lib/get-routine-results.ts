import { getRoutineBuilds } from '@/services/build'
import { getCases } from '@/services/case'
import { getBuildCaseResults } from '@/services/case-result'
import { getCaseTypes } from '@/services/case-type'
import { getCaseHistories } from '@/services/history'

import { TestResult } from '@/types/test-result'
import { Build, Case, CaseResult, Routine } from '@/types/testray'

import { getTestResult } from './get-test-result'
import { inheritMetadata } from './inherit-metadata'
import {
	getInheritedBuildId,
	markInherited,
	wasInherited,
} from './inherited-builds'
import {
	computeSkippedBuildIds,
	logEvent,
	snapshot,
	startRun,
} from './page-management-audit'
import { hasHistory } from './test-history'
import { getTypeWeight } from './test-type'

export async function getRoutineResults(routineId: Routine['id']): Promise<{
	results: TestResult[]
	build: { id: Build['id']; date: string; gitHash: string }
}> {
	const audit = startRun(routineId, 'web')

	const [lastBuild, previousDayBuild] = await getRoutineBuilds({
		routineId,
		limit: 2,
	})

	if (audit) {
		audit.lastBuildId = lastBuild?.id
		audit.previousBuildId = previousDayBuild?.id

		const recentBuildIds = (
			await getRoutineBuilds({ routineId, limit: 10 })
		).map((build) => build.id)

		const markerBuildId = await getInheritedBuildId(routineId)

		await logEvent(audit, 'build.select', {
			lastBuildId: lastBuild?.id ?? null,
			lastBuildDate: lastBuild?.dateCreated ?? null,
			previousBuildId: previousDayBuild?.id ?? null,
			previousBuildDate: previousDayBuild?.dateCreated ?? null,
			previousBuildMissing: !previousDayBuild,
			recentBuildIds,
			inheritedMarkerBuildId: markerBuildId,
			skippedBuildIds: computeSkippedBuildIds(
				recentBuildIds,
				markerBuildId
			),
		})
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

	const caseIds = caseResults.map(
		(caseResult) => caseResult.r_caseToCaseResult_c_caseId
	)

	const cases = await getCases(caseIds)

	const caseTypeIds = [
		...new Set(
			cases.map((caseItem) => caseItem.r_caseTypeToCases_c_caseTypeId)
		),
	]

	const caseTypes = await getCaseTypes(caseTypeIds)

	const histories =
		cases.length > 50
			? new Map()
			: await getCaseHistories({
					caseIds: cases
						.filter((testCase) => hasHistory(testCase))
						.map((testCase) => testCase.id),
					routineId,
				})

	const casesMap = new Map(cases.map((caseItem) => [caseItem.id, caseItem]))

	const inherited = await wasInherited(routineId, lastBuild.id)

	if (inherited) {
		await logEvent(audit, 'inherit.skip', {
			reason: 'already-inherited',
			lastBuildId: lastBuild.id,
		})
	}

	const results = []

	for (let caseResult of caseResults) {
		const caseId = caseResult.r_caseToCaseResult_c_caseId

		const testCase = casesMap.get(caseId)

		if (!testCase || testCase.name === 'Top Level Build') {
			continue
		}

		if (
			testCase.name.startsWith('playwright-js-tomcat101-postgresql') ||
			testCase.name.startsWith('modules-integration-postgresql')
		) {
			continue
		}

		if (!inherited) {
			caseResult = await inheritMetadata(
				previousDayIssues,
				caseResult,
				audit
			)
		}

		const history = histories.get(testCase.id) ?? null

		const isNew = isNewFailure(caseResult, testCase, previousDayIssues)

		const result = getTestResult({
			caseResult,
			testCase,
			isNew,
			caseTypes,
			history,
		})

		results.push(result)
	}

	if (!inherited) {
		await markInherited(routineId, lastBuild.id)
	}

	sortResults(results)

	return {
		results,
		build: {
			id: lastBuild.id,
			date: lastBuild.dateCreated,
			gitHash: lastBuild.gitHash,
		},
	}
}

function isNewFailure(
	caseResult: CaseResult,
	testCase: Case,
	previousDayIssues: CaseResult[]
) {
	if (caseResult.dueStatus.key !== 'FAILED') {
		return false
	}

	const caseIds = new Set(
		previousDayIssues.map(
			(caseResult) => caseResult.r_caseToCaseResult_c_caseId
		)
	)

	return !caseIds.has(testCase.id)
}

function sortResults(results: TestResult[]) {
	return results.sort((a, b) => getTypeWeight(a.type) - getTypeWeight(b.type))
}
