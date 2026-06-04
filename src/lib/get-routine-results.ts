import { getRoutineBuilds } from '@/services/build'
import { getCases } from '@/services/case'
import { getBuildCaseResults } from '@/services/case-result'
import { getCaseTypes } from '@/services/case-type'
import { getCaseHistories } from '@/services/history'

import { TestResult } from '@/types/test-result'
import { Build, Case, CaseResult, Routine } from '@/types/testray'

import { getTestResult } from './get-test-result'
import { inheritMetadata } from './inherit-metadata'
import { markInherited, wasInherited } from './inherited-builds'
import { hasHistory } from './test-history'
import { getTypeWeight } from './test-type'

export async function getRoutineResults(routineId: Routine['id']): Promise<{
	results: TestResult[]
	build: { id: Build['id']; date: string; gitHash: string }
}> {
	const [lastBuild, previousDayBuild] = await getRoutineBuilds({
		routineId,
		limit: 2,
	})

	const previousDayIssues = await getBuildCaseResults({
		buildId: previousDayBuild.id,
		statuses: ['FAILED', 'BLOCKED', 'UNTESTED'],
	})

	const caseResults = await getBuildCaseResults({
		buildId: lastBuild.id,
		statuses: ['FAILED', 'BLOCKED', 'UNTESTED'],
	})

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

	const results = []

	for (let caseResult of caseResults) {
		const caseId = caseResult.r_caseToCaseResult_c_caseId

		const testCase = casesMap.get(caseId)

		if (!testCase || testCase.name === 'Top Level Build') {
			continue
		}

		if (!inherited) {
			caseResult = await inheritMetadata(previousDayIssues, caseResult)
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
