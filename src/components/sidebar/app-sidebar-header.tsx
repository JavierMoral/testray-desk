'use client'

import { useParams } from 'next/navigation'

import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

import { ROUTINES } from '@/lib/routines'

export function AppSidebarHeader() {
	const params = useParams<{ id?: string }>()

	const routineId = params.id

	const routine = routineId ? ROUTINES[routineId] : null

	return (
		<header className="flex gap-4 h-16 items-center border-b p-4">
			<SidebarTrigger />

			{routine ? (
				<>
					<Separator orientation="vertical" />

					<div className="flex items-center gap-2 font-medium">
						<span className="[&>svg]:size-5">{routine.icon}</span>

						<span className="text-base">{routine.name}</span>
					</div>
				</>
			) : null}
		</header>
	)
}
