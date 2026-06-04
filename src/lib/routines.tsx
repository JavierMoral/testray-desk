import { IconFile, IconFolders, IconLayoutBoard } from '@tabler/icons-react'
import type { ReactNode } from 'react'

import { User } from '@/types/user'

type Routine = {
	icon: ReactNode
	name: string
	routineId: number
	users: User[]
}

export const ROUTINES: Record<string, Routine> = {
	'page-management': {
		icon: <IconFile />,
		name: 'Page Management',
		routineId: 985092,
		users: [
			{ id: 5175336, name: 'Víctor' },
			{ id: 10893546, name: 'Balázs' },
			{ id: 12929091, name: 'Georgel' },
			{ id: 10981196, name: 'Chaparro' },
			{ id: 9607391, name: 'Rubén' },
			{ id: 44233335, name: 'Javi' },
			{ id: 33780064, name: 'Lourdes' },
			{ id: 5383891, name: 'Sandro' },
		],
	},
	'cms': {
		icon: <IconLayoutBoard />,
		name: 'CMS',
		routineId: 336020509,
		users: [
			{ id: 5125486, name: 'Jürgen' },
			{ id: 5677028, name: 'Mikel' },
			{ id: 243081656, name: 'Roselaine' },
			{ id: 9459540, name: 'Vero' },
		],
	},
	'content-management': {
		icon: <IconFolders />,
		name: 'Content Management',
		routineId: 1021677,
		users: [
			{ id: 5125486, name: 'Jürgen' },
			{ id: 5677028, name: 'Mikel' },
			{ id: 243081656, name: 'Roselaine' },
			{ id: 9459540, name: 'Vero' },
		],
	},
}
