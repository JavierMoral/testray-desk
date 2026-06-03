'use client'

import { IconMoodSadDizzy } from '@tabler/icons-react'
import { useParams } from 'next/navigation'

import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'

import { PageState } from '@/components/page-state'
import { TestTable } from '@/components/test-table/test-table'

import { useRoutineResults } from '@/hooks/use-routine-results'

import { ROUTINES } from '@/lib/routines'

import { TestResult } from '@/types/test-result'

export default function Page() {
	const params = useParams<{ id: string }>()

	const routine = ROUTINES[params.id]

	const routineId = routine?.routineId ?? null

	const { loading, build, error, results } = useRoutineResults(routineId)

	if (!routine || error) {
		return <Error message={error} />
	}

	if (loading || !build) {
		return <Loading />
	}

	return (
		<div className="flex flex-col gap-6 p-6">
			<Summary date={build.date} results={results} />

			<TestTable
				results={results}
				users={routine.users}
				routineId={routine.routineId}
				build={build}
			/>
		</div>
	)
}

function Summary({ date, results }: { date: string; results: TestResult[] }) {
	const formattedDate = new Date(date).toLocaleDateString('en-US', {
		dateStyle: 'medium',
	})

	return (
		<div className="flex items-center gap-4 h-12">
			<div className="flex flex-col gap-1">
				<span className="text-xs text-muted-foreground">
					Last build date
				</span>
				<span className="font-medium">{formattedDate}</span>
			</div>

			<Separator orientation="vertical" />

			<div className="flex flex-col gap-1">
				<span className="text-xs text-muted-foreground">
					Total issues
				</span>
				<span className="font-medium">{results.length}</span>
			</div>
		</div>
	)
}

function Loading() {
	return (
		<PageState
			icon={<Spinner className="size-6" />}
			title="Obtaining data from Testray"
			text="Please wait, this may take a while."
		/>
	)
}

function Error({ message }: { message: string | null }) {
	return (
		<PageState
			icon={<IconMoodSadDizzy className="size-6" />}
			title="Something was wrong"
			text={
				message ||
				'An error occurred while retrieving data, please try again later.'
			}
		/>
	)
}
