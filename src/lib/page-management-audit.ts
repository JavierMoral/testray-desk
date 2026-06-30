/**
 * Observability for the "page-management" routine only (routineId 985092).
 *
 * Why this exists: comments and assignees live on Testray CaseResult objects
 * and are carried across builds by a single-link inheritance chain
 * (see inherit-metadata.ts). If any single build fails to copy a comment or
 * assignee forward, it is lost for every later build. These traces capture the
 * state at every decision and write point so that the next time data goes
 * missing we can pinpoint which build transition dropped it, and why.
 *
 * Outputs (all under .cache/, which is gitignored):
 *  - page-management-audit.jsonl          append-only event log, one JSON/line
 *  - page-management-snapshots/<buildId>.json
 *                                         metadata present on each build, for
 *                                         diffing two consecutive builds
 *
 * Nothing here changes inheritance behavior; it is pure instrumentation and a
 * no-op for every routine except page-management (startRun returns null, and
 * every other function short-circuits on a null context).
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { Build, CaseResult, Routine } from '@/types/testray'

export const PAGE_MANAGEMENT_ROUTINE_ID = 985092

const DIR = path.join(process.cwd(), '.cache')
const LOG_FILE = path.join(DIR, 'page-management-audit.jsonl')
const SNAPSHOT_DIR = path.join(DIR, 'page-management-snapshots')
const SNAPSHOT_KEEP = 40

export type AuditSource = 'web' | 'cron' | 'manual'

export type AuditContext = {
	runId: string
	source: AuditSource
	lastBuildId?: Build['id']
	previousBuildId?: Build['id']
}

export function isPageManagement(routineId: Routine['id']): boolean {
	return routineId === PAGE_MANAGEMENT_ROUTINE_ID
}

/**
 * Returns an audit context for page-management, or null for any other routine.
 * Callers pass the (possibly null) context straight through to logEvent /
 * snapshot / inheritMetadata, all of which no-op on null.
 */
export function startRun(
	routineId: Routine['id'],
	source: AuditSource
): AuditContext | null {
	if (!isPageManagement(routineId)) {
		return null
	}

	return { runId: randomUUID().slice(0, 8), source }
}

export async function logEvent(
	ctx: AuditContext | null,
	event: string,
	fields: Record<string, unknown> = {}
): Promise<void> {
	if (!ctx) {
		return
	}

	const record = {
		ts: new Date().toISOString(),
		runId: ctx.runId,
		source: ctx.source,
		event,
		...fields,
	}

	// Mirror to stderr (never stdout) so cron logs show events live without
	// colliding with the 'false' the job writes to stdout.
	console.error('[page-management-audit]', JSON.stringify(record))

	try {
		await fs.mkdir(DIR, { recursive: true })
		await fs.appendFile(LOG_FILE, JSON.stringify(record) + '\n')
	} catch (e) {
		console.error('[page-management-audit] failed to append', e)
	}
}

/**
 * Per-case-result fields safe to log: presence and length of metadata, never
 * the comment body. commentBlank flags a truthy-but-empty comment (e.g. " ")
 * which silently blocks inheritance yet reads as empty in the UI.
 */
export function summarize(caseResult: CaseResult) {
	const comment = caseResult.comment
	const hasComment = typeof comment === 'string' && comment.length > 0

	return {
		caseResultId: caseResult.id,
		caseId: caseResult.r_caseToCaseResult_c_caseId,
		status: caseResult.dueStatus.key,
		userId: caseResult.r_userToCaseResults_userId ?? null,
		hasComment,
		commentLength: typeof comment === 'string' ? comment.length : 0,
		commentBlank:
			typeof comment === 'string' && comment.trim().length === 0,
	}
}

/**
 * Builds newer than the last processed build (the marker) that we never
 * inherited from — the smoking gun for a broken chain (H1). recentBuildIds
 * must be sorted newest-first; index 0 is the build being processed now.
 */
export function computeSkippedBuildIds(
	recentBuildIds: Array<Build['id']>,
	markerBuildId: Build['id'] | null
): Array<Build['id']> {
	if (markerBuildId === null) {
		return []
	}

	const markerIndex = recentBuildIds.indexOf(markerBuildId)

	if (markerIndex === -1) {
		// Marker is older than the window we fetched: every build but the one
		// we are processing now is unaccounted for.
		return recentBuildIds.slice(1)
	}

	return recentBuildIds.slice(1, markerIndex)
}

/**
 * Writes the metadata present on a build (comment / assignee per case result)
 * to .cache/page-management-snapshots/<buildId>.json. Builds are immutable, so
 * re-snapshotting an existing build simply refreshes it with the latest known
 * metadata (e.g. after a user edit). Diff two consecutive build files to see
 * exactly which case lost its comment/assignee and at which transition.
 */
export async function snapshot(
	ctx: AuditContext | null,
	buildId: Build['id'],
	caseResults: CaseResult[]
): Promise<void> {
	if (!ctx) {
		return
	}

	try {
		await fs.mkdir(SNAPSHOT_DIR, { recursive: true })

		const metadata = caseResults
			// Only rows carrying real metadata that could be lost: a non-empty
			// comment or a real assignee. Testray uses userId 0 for "unassigned",
			// so a truthy check (not `!== undefined`) excludes that noise.
			.filter(
				(caseResult) =>
					caseResult.comment || caseResult.r_userToCaseResults_userId
			)
			.map((caseResult) => ({
				caseResultId: caseResult.id,
				caseId: caseResult.r_caseToCaseResult_c_caseId,
				status: caseResult.dueStatus.key,
				userId: caseResult.r_userToCaseResults_userId ?? null,
				comment: caseResult.comment ?? null,
			}))

		await fs.writeFile(
			path.join(SNAPSHOT_DIR, `${buildId}.json`),
			JSON.stringify(
				{
					ts: new Date().toISOString(),
					runId: ctx.runId,
					buildId,
					count: metadata.length,
					metadata,
				},
				null,
				'\t'
			)
		)

		await pruneSnapshots()
	} catch (e) {
		console.error('[page-management-audit] failed to snapshot', e)
	}
}

async function pruneSnapshots(): Promise<void> {
	const files = (await fs.readdir(SNAPSHOT_DIR))
		.filter((file) => file.endsWith('.json'))
		.sort((a, b) => parseInt(b, 10) - parseInt(a, 10))

	await Promise.all(
		files
			.slice(SNAPSHOT_KEEP)
			.map((file) =>
				fs.rm(path.join(SNAPSHOT_DIR, file), { force: true })
			)
	)
}
