'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

export function NavRoutine({
	id,
	icon,
	name,
}: {
	id: string
	icon: React.ReactNode
	name: string
}) {
	const pathname = usePathname()

	const isActive = pathname === `/routines/${id}`

	return (
		<SidebarMenuItem>
			<SidebarMenuButton asChild isActive={isActive}>
				<Link href={`/routines/${id}`}>
					{icon}

					{name}
				</Link>
			</SidebarMenuButton>
		</SidebarMenuItem>
	)
}
