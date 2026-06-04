import fs from 'node:fs/promises'
import path from 'node:path'

import { Build, Routine } from '@/types/testray'

const FILE = path.join(process.cwd(), '.cache', 'inherited-builds.json')

type Markers = Record<string, Build['id']>

async function read(): Promise<Markers> {
	try {
		const content = await fs.readFile(FILE, 'utf-8')

		return JSON.parse(content) as Markers
	} catch {
		return {}
	}
}

export async function wasInherited(
	routineId: Routine['id'],
	buildId: Build['id']
): Promise<boolean> {
	const markers = await read()

	return markers[routineId] === buildId
}

export async function markInherited(
	routineId: Routine['id'],
	buildId: Build['id']
): Promise<void> {
	try {
		const markers = await read()

		markers[routineId] = buildId

		await fs.mkdir(path.dirname(FILE), { recursive: true })
		await fs.writeFile(FILE, JSON.stringify(markers))
	} catch (e) {
		console.error(e)
	}
}
