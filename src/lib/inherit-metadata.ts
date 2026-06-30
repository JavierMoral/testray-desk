import { updateCaseResult } from '@/services/case-result'

import { AuditContext, logEvent, summarize } from '@/lib/page-management-audit'

import { CaseResult } from '@/types/testray'

export async function inheritMetadata(
	previousDayIssues: CaseResult[],
	caseResult: CaseResult,
	audit?: AuditContext | null
) {
	const previousDayCaseResult = previousDayIssues.find(
		({ r_caseToCaseResult_c_caseId }) =>
			r_caseToCaseResult_c_caseId ===
			caseResult.r_caseToCaseResult_c_caseId
	)

	if (!previousDayCaseResult) {
		return caseResult
	}

	const previousUserId = previousDayCaseResult.r_userToCaseResults_userId
	const previousComment = previousDayCaseResult.comment

	const shouldInheritUserId =
		previousUserId && !caseResult.r_userToCaseResults_userId

	const shouldInheritComment = previousComment && !caseResult.comment

	if (audit && (previousUserId || previousComment)) {
		await logEvent(audit, 'inherit.eval', {
			caseId: caseResult.r_caseToCaseResult_c_caseId,
			previousBuildId: audit.previousBuildId,
			lastBuildId: audit.lastBuildId,
			previous: summarize(previousDayCaseResult),
			current: summarize(caseResult),
			willInheritUserId: Boolean(shouldInheritUserId),
			willInheritComment: Boolean(shouldInheritComment),
		})

		// Previous build carried a comment, but the current case result already
		// holds a truthy-but-blank comment (e.g. " ") which blocks inheritance
		// and reads as "lost" in the UI.
		const blockedByBlankComment =
			Boolean(previousComment) &&
			!shouldInheritComment &&
			typeof caseResult.comment === 'string' &&
			caseResult.comment.trim().length === 0

		if (blockedByBlankComment) {
			await logEvent(audit, 'inherit.LOSS_RISK', {
				reason: 'current-comment-blank-but-truthy',
				caseId: caseResult.r_caseToCaseResult_c_caseId,
				caseResultId: caseResult.id,
				previousBuildId: audit.previousBuildId,
				lastBuildId: audit.lastBuildId,
			})
		}
	}

	if (!shouldInheritUserId && !shouldInheritComment) {
		return caseResult
	}

	const updated = await updateCaseResult({
		id: caseResult.id,
		userId: shouldInheritUserId ? previousUserId : undefined,
		comment: shouldInheritComment ? previousComment : undefined,
	})

	await logEvent(audit ?? null, 'inherit.apply', {
		caseId: caseResult.r_caseToCaseResult_c_caseId,
		caseResultId: caseResult.id,
		previousBuildId: audit?.previousBuildId,
		lastBuildId: audit?.lastBuildId,
		inheritedUserId: shouldInheritUserId ? previousUserId : null,
		inheritedComment: Boolean(shouldInheritComment),
		ok: updated !== undefined,
	})

	return updated
}
