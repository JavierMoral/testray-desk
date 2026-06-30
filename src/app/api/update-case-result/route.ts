import { getRoutineBuilds } from '@/services/build'
import { updateCaseResult } from '@/services/case-result'
import { NextResponse } from 'next/server'

import { invalidate } from '@/lib/cache'
import { nextRoute } from '@/lib/next-route'
import { logEvent, startRun } from '@/lib/page-management-audit'

export const PATCH = nextRoute({
	handler: async (request: Request) => {
		const body = await request.json()

		const { id, routineId, userId, comment } = body

		await updateCaseResult({ id, userId, comment })

		await invalidate(routineId)

		const audit = startRun(routineId, 'manual')

		if (audit) {
			const [latestBuild] = await getRoutineBuilds({
				routineId,
				limit: 1,
			})

			// latestBuildId lets us later cross-check (via the build snapshots)
			// whether this edit landed on a stale, non-latest build whose
			// metadata will never be inherited forward (H5).
			await logEvent(audit, 'manual.edit', {
				caseResultId: id,
				latestBuildId: latestBuild?.id ?? null,
				setUserId: userId ?? null,
				setComment: typeof comment === 'string',
				commentLength: typeof comment === 'string' ? comment.length : 0,
				commentBlank:
					typeof comment === 'string' && comment.trim().length === 0,
			})
		}

		return NextResponse.json({ success: true })
	},
	error: 'Unable to update test case result',
})
