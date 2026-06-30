import { getRoutineBuilds } from '@/services/build'
import { getBuildCaseResults } from '@/services/case-result'

import {
	LEDGER_FILE,
	loadLedger,
	pruneLedger,
	saveLedger,
} from '@/lib/expected-metadata'
import {
	computeSkippedBuildIds,
	snapshot,
	startRun,
} from '@/lib/page-management-audit'
import { ROUTINES } from '@/lib/routines'

import { Status } from '@/types/testray'

const ROUTINE_KEY = 'page-management'
const STATUSES: Status[] = ['FAILED', 'BLOCKED', 'UNTESTED']

const routine = ROUTINES[ROUTINE_KEY]
const usersById = new Map(routine.users.map((user) => [user.id, user.name]))

function userName(id: number | null | undefined): string {
	return id ? (usersById.get(id) ?? String(id)) : '—'
}

function caseResultLink(buildId: number, caseResultId: number): string {
	return `https://testray.liferay.com/#/project/35392/routines/${routine.routineId}/build/${buildId}/case-result/${caseResultId}`
}

async function main() {
	const reset = process.argv.includes('--reset')

	const audit = startRun(routine.routineId, 'verify')

	const builds = await getRoutineBuilds({
		routineId: routine.routineId,
		limit: 10,
	})

	const [last, previous] = builds

	if (!last) {
		console.log('Page Management: no hay builds que verificar.')

		return
	}

	const lastIssues = await getBuildCaseResults({
		buildId: last.id,
		statuses: STATUSES,
	})

	if (audit) {
		audit.lastBuildId = last.id
		audit.previousBuildId = previous?.id
	}

	if (previous) {
		const previousIssues = await getBuildCaseResults({
			buildId: previous.id,
			statuses: STATUSES,
		})

		await snapshot(audit, previous.id, previousIssues)
	}

	await snapshot(audit, last.id, lastIssues)

	const ledger = await loadLedger()
	const previousVerifiedBuildId = ledger.lastVerifiedBuildId

	if (reset) {
		ledger.cases = {}
	}

	const currentByCase = new Map(
		lastIssues.map((caseResult) => [
			caseResult.r_caseToCaseResult_c_caseId,
			caseResult,
		])
	)

	// Detect losses: a case the ledger expects to carry metadata, still failing
	// now, but whose assignee/comment is gone from the current build.
	const losses = []

	for (const [caseIdKey, expected] of Object.entries(ledger.cases)) {
		const current = currentByCase.get(Number(caseIdKey))

		if (!current) {
			continue // ya no falla -> no es pérdida, es esperado
		}

		const lostAssignee =
			!!expected.userId && !current.r_userToCaseResults_userId
		const lostComment = !!expected.comment && !current.comment

		if (lostAssignee || lostComment) {
			losses.push({
				caseId: Number(caseIdKey),
				caseResultId: current.id,
				status: current.dueStatus.key,
				expected,
				lostAssignee,
				lostComment,
			})
		}
	}

	// Update the ledger from the current real metadata. A real assignee or a
	// non-empty comment overwrites what we remembered; empty values never
	// overwrite, so the expected value persists until the case is fixed.
	const nowIso = new Date().toISOString()
	let tracked = 0

	for (const caseResult of lastIssues) {
		const key = String(caseResult.r_caseToCaseResult_c_caseId)

		const entry = ledger.cases[key] ?? {
			userId: null,
			comment: null,
			status: caseResult.dueStatus.key,
			lastSeen: nowIso,
		}

		entry.lastSeen = nowIso
		entry.status = caseResult.dueStatus.key

		if (caseResult.r_userToCaseResults_userId) {
			entry.userId = caseResult.r_userToCaseResults_userId
		}

		if (caseResult.comment) {
			entry.comment = caseResult.comment
		}

		if (entry.userId || entry.comment) {
			tracked += 1
		}

		ledger.cases[key] = entry
	}

	pruneLedger(ledger, Date.now())
	ledger.lastVerifiedBuildId = last.id
	await saveLedger(ledger)

	const skippedBuildIds = computeSkippedBuildIds(
		builds.map((build) => build.id),
		previousVerifiedBuildId
	)

	report({
		lastBuildId: last.id,
		lastBuildDate: last.dateCreated,
		previousBuildId: previous?.id ?? null,
		failing: lastIssues.length,
		tracked,
		losses,
		skippedBuildIds,
		reset,
	})

	process.exit(losses.length > 0 ? 1 : 0)
}

type Loss = {
	caseId: number
	caseResultId: number
	status: Status
	expected: { userId: number | null; comment: string | null }
	lostAssignee: boolean
	lostComment: boolean
}

function report(data: {
	lastBuildId: number
	lastBuildDate: string
	previousBuildId: number | null
	failing: number
	tracked: number
	losses: Loss[]
	skippedBuildIds: number[]
	reset: boolean
}) {
	const line = '─'.repeat(60)

	console.log(line)
	console.log(' Page Management · verificación de metadata')
	console.log(line)
	console.log(
		` Build actual  : ${data.lastBuildId}  (${new Date(data.lastBuildDate).toLocaleString('es-ES')})`
	)
	console.log(` Build previo  : ${data.previousBuildId ?? '—'}`)
	console.log(
		` Casos en fallo: ${data.failing} · con metadata en seguimiento: ${data.tracked}`
	)
	console.log('')

	if (data.reset) {
		console.log(
			' ↺ Ledger reiniciado: se acepta el estado actual como base.'
		)
		console.log('')
	}

	console.log(` ✓ Conservados : ${data.tracked - data.losses.length}`)
	console.log(` ✗ PERDIDOS    : ${data.losses.length}`)

	for (const loss of data.losses) {
		const parts = []

		if (loss.lostAssignee) {
			parts.push(`ASIGNADO (esperado: ${userName(loss.expected.userId)})`)
		}

		if (loss.lostComment) {
			parts.push(`COMENTARIO (esperado: "${loss.expected.comment}")`)
		}

		console.log(
			`    • case ${loss.caseId} [${loss.status}] perdió ${parts.join(' y ')}`
		)
		console.log(
			`      ${caseResultLink(data.lastBuildId, loss.caseResultId)}`
		)
	}

	if (data.skippedBuildIds.length > 0) {
		console.log('')
		console.log(
			` ⚠ Builds saltados desde la última verificación: ${data.skippedBuildIds.join(', ')}`
		)
		console.log(
			'    (entró más de un build sin verificar → posible rotura de cadena, H1)'
		)
	}

	console.log('')
	console.log(` Ledger: ${LEDGER_FILE}`)

	if (data.losses.length === 0) {
		console.log(' Todo correcto ✓')
	}

	console.log(line)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
