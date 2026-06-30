/**
 * Accumulated "expected metadata" ledger for the page-management routine,
 * keyed by caseId. It records the last-known assignee/comment seen for each
 * failing case so the daily verify (src/scripts/verify-metadata.ts) can flag a
 * loss even when it happened several builds back or across a status flicker
 * (FAILED -> PASSED -> FAILED) that a plain two-build diff would miss.
 *
 * Stored under .cache/ (gitignored). Page-management only.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import { Build, Status } from '@/types/testray'

export const LEDGER_FILE = path.join(
	process.cwd(),
	'.cache',
	'page-management-expected-metadata.json'
)

const PRUNE_AFTER_DAYS = 45

export type ExpectedEntry = {
	userId: number | null
	comment: string | null
	status: Status
	lastSeen: string
}

export type Ledger = {
	lastVerifiedBuildId: Build['id'] | null
	cases: Record<string, ExpectedEntry>
}

export async function loadLedger(): Promise<Ledger> {
	try {
		const parsed = JSON.parse(
			await fs.readFile(LEDGER_FILE, 'utf-8')
		) as Partial<Ledger>

		return {
			lastVerifiedBuildId: parsed.lastVerifiedBuildId ?? null,
			cases: parsed.cases ?? {},
		}
	} catch {
		return { lastVerifiedBuildId: null, cases: {} }
	}
}

export async function saveLedger(ledger: Ledger): Promise<void> {
	await fs.mkdir(path.dirname(LEDGER_FILE), { recursive: true })
	await fs.writeFile(LEDGER_FILE, JSON.stringify(ledger, null, '\t'))
}

/**
 * Drops entries not seen as a failing case for a long time, so cases that
 * stopped failing for good don't accumulate forever. nowMs is injected so the
 * caller owns the clock.
 */
export function pruneLedger(ledger: Ledger, nowMs: number): void {
	const cutoff = nowMs - PRUNE_AFTER_DAYS * 24 * 60 * 60 * 1000

	for (const [caseId, entry] of Object.entries(ledger.cases)) {
		if (new Date(entry.lastSeen).getTime() < cutoff) {
			delete ledger.cases[caseId]
		}
	}
}
