import { getRoutineBuilds } from '@/services/build'
import { KnownBlock, WebClient } from '@slack/web-api'
import fs from 'node:fs'
import path from 'node:path'

import { SLACK_BOT_TOKEN, SLACK_CHANNEL } from '@/lib/env'
import { getRoutineResults } from '@/lib/get-routine-results'
import { TEAMS } from '@/lib/teams'

import { TestResult } from '@/types/test-result'
import { Build, Routine } from '@/types/testray'
import { User } from '@/types/user'

if (!SLACK_BOT_TOKEN || !SLACK_CHANNEL) {
	throw new Error('SLACK_BOT_TOKEN and SLACK_CHANNEL are required')
}

const slack = new WebClient(SLACK_BOT_TOKEN)
const channel = SLACK_CHANNEL

const EMOJI_PLAYWRIGHT = ':playwright:'
const EMOJI_JAVA = ':java:'

const TESTRAY_DESK_URL = 'https://testray-desk.liferay.org.es'

const MAX_COMMENT_LENGTH = 200

const LAST_PROCESSED_SUMMARY_BUILD_ID_FILE = path.join(
	process.cwd(),
	'.last-processed-summary-build-id'
)

function buildFailureBlock(
	result: TestResult,
	usersById: Map<User['id'], User['name']>,
	routineId: Routine['id'],
	buildId: Build['id']
): KnownBlock {
	const isPlaywright = result.type === 'Playwright Test'
	const emoji = isPlaywright ? EMOJI_PLAYWRIGHT : EMOJI_JAVA
	const reportUrl = isPlaywright
		? result.links.playwrightReport
		: result.links.failureMessages

	const caseResultUrl = buildCaseResultLink(
		routineId,
		buildId,
		result.caseResultId
	)
	const name = escapeSlackText(result.name)
	const title = `<${caseResultUrl}|${name}>`

	const lines: string[] = [`${emoji} *${title}*`]

	const assigneeName =
		result.userId !== undefined ? usersById.get(result.userId) : undefined

	if (assigneeName) {
		lines.push(
			`        :bust_in_silhouette: ${escapeSlackText(assigneeName)}`
		)
	}

	const comment = result.comment?.trim()

	if (comment) {
		const truncated =
			comment.length > MAX_COMMENT_LENGTH
				? `${comment.slice(0, MAX_COMMENT_LENGTH)}…`
				: comment

		const quoted = escapeSlackText(truncated)
			.split('\n')
			.map((line) => `> ${line}`)
			.join('\n')

		lines.push(quoted)
	}

	const block: KnownBlock = {
		type: 'section',
		text: { type: 'mrkdwn', text: lines.join('\n') },
	}

	if (reportUrl) {
		block.accessory = {
			type: 'button',
			text: { type: 'plain_text', text: 'Report' },
			url: reportUrl,
		}
	}

	return block
}

function buildThreadBlocks(
	title: string,
	failures: TestResult[],
	usersById: Map<User['id'], User['name']>,
	routineId: Routine['id'],
	buildId: Build['id']
): KnownBlock[] {
	const blocks: KnownBlock[] = [
		{
			type: 'header',
			text: { type: 'plain_text', text: title },
		},
		{ type: 'divider' },
	]

	blocks.push(
		...failures.map((result) =>
			buildFailureBlock(result, usersById, routineId, buildId)
		)
	)

	return blocks
}

function escapeSlackText(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

function buildRoutineLink(routineId: Routine['id']) {
	return `https://testray.liferay.com/#/project/35392/routines/${routineId}`
}

function buildCaseResultLink(
	routineId: Routine['id'],
	buildId: Build['id'],
	caseResultId: TestResult['caseResultId']
) {
	return `https://testray.liferay.com/#/project/35392/routines/${routineId}/build/${buildId}/case-result/${caseResultId}`
}

function readLastProcessedSummaryBuildId(): Build['id'] | null {
	try {
		const content = fs
			.readFileSync(LAST_PROCESSED_SUMMARY_BUILD_ID_FILE, 'utf-8')
			.trim()
		const id = Number(content)

		return Number.isFinite(id) ? id : null
	} catch {
		return null
	}
}

function writeLastProcessedSummaryBuildId(id: Build['id']): void {
	fs.writeFileSync(LAST_PROCESSED_SUMMARY_BUILD_ID_FILE, String(id))
}

async function main() {
	const team = TEAMS['page-management']

	const [latestBuild] = await getRoutineBuilds({
		routineId: team.routineId,
		limit: 1,
	})

	if (!latestBuild) {
		return
	}

	if (readLastProcessedSummaryBuildId() === latestBuild.id) {
		return
	}

	const { results, build } = await getRoutineResults(team.routineId)

	const failures = results.filter((result) => result.status === 'FAILED')
	const blocked = results.filter((result) => result.status === 'BLOCKED')
	const untested = results.filter((result) => result.status === 'UNTESTED')
	const newFailures = failures.filter((result) => result.isNew)
	const existingFailures = failures.filter((result) => !result.isNew)

	const usersById = new Map(team.users.map((user) => [user.id, user.name]))

	const routineUrl = buildRoutineLink(team.routineId)

	let countsText = `:x: ${newFailures.length} new / ${failures.length} total failures`

	if (blocked.length > 0) {
		countsText += ` | :no_entry: ${blocked.length} blocked`
	}

	if (untested.length > 0) {
		countsText += ` | :grey_question: ${untested.length} untested`
	}

	const parent = await slack.chat.postMessage({
		channel,
		text: `Test Routine Results — ${countsText}`,
		blocks: [
			{
				type: 'header',
				text: {
					type: 'plain_text',
					text: ':bar_chart: Test Routine Results',
					emoji: true,
				},
			},
			{
				type: 'section',
				text: { type: 'mrkdwn', text: countsText },
			},
			{
				type: 'section',
				text: {
					type: 'mrkdwn',
					text: [
						`:link: <${routineUrl}|View routine>`,
						`:testray: <${TESTRAY_DESK_URL}|Testray-desk>`,
					].join('\n'),
				},
			},
		],
	})

	if (newFailures.length > 0 && parent.ts) {
		await slack.chat.postMessage({
			channel,
			thread_ts: parent.ts,
			text: `New Failures (${newFailures.length})`,
			blocks: buildThreadBlocks(
				'New Failures',
				newFailures,
				usersById,
				team.routineId,
				build.id
			),
		})
	}

	if (existingFailures.length > 0 && parent.ts) {
		await slack.chat.postMessage({
			channel,
			thread_ts: parent.ts,
			text: `Existing Failures (${existingFailures.length})`,
			blocks: buildThreadBlocks(
				'Existing Failures',
				existingFailures,
				usersById,
				team.routineId,
				build.id
			),
		})
	}

	writeLastProcessedSummaryBuildId(latestBuild.id)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
