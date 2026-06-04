'use client'

import { IconFilter2, IconX } from '@tabler/icons-react'
import type { ColumnFiltersState } from '@tanstack/react-table'
import type { Dispatch, SetStateAction } from 'react'
import { useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

import { getStatusIcon, getStatusLabel } from '@/lib/test-status'
import { getTypeIcon, getTypeLabel } from '@/lib/test-type'

import { TestResult } from '@/types/test-result'
import { User } from '@/types/user'

export function Filters({
	results,
	users,
	columnFilters,
	setColumnFilters,
}: {
	results: TestResult[]
	users: User[]
	columnFilters: ColumnFiltersState
	setColumnFilters: Dispatch<SetStateAction<ColumnFiltersState>>
}) {
	const typeOptions = useMemo(() => {
		const counts: Record<string, number> = {}

		for (const result of results) {
			counts[result.type] = (counts[result.type] ?? 0) + 1
		}

		return Object.entries(counts).map(([type, count]) => ({
			label: getTypeLabel(type as TestResult['type']),
			value: type,
			count,
			icon: getTypeIcon(type as TestResult['type']),
		}))
	}, [results])

	const newOptions = useMemo(
		() => [
			{
				label: 'Yes',
				value: 'yes',
				count: results.filter((result) => result.isNew).length,
			},
			{
				label: 'No',
				value: 'no',
				count: results.filter((result) => !result.isNew).length,
			},
		],
		[results]
	)

	const statusOptions = useMemo(() => {
		const counts: Record<string, number> = {}

		for (const result of results) {
			counts[result.status] = (counts[result.status] ?? 0) + 1
		}

		return Object.entries(counts).map(([status, count]) => ({
			label: getStatusLabel(status as TestResult['status']),
			value: status,
			count,
			icon: getStatusIcon(status as TestResult['status']),
		}))
	}, [results])

	const assigneeOptions = useMemo(() => {
		const counts: Record<string, number> = {}

		for (const result of results) {
			const key =
				result.userId && result.userId !== 0
					? String(result.userId)
					: 'unassigned'

			counts[key] = (counts[key] ?? 0) + 1
		}

		const options = users
			.filter((user) => counts[String(user.id)])
			.map((user) => ({
				label: user.name,
				value: String(user.id),
				count: counts[String(user.id)],
			}))

		if (counts.unassigned) {
			options.push({
				label: 'Unassigned',
				value: 'unassigned',
				count: counts.unassigned,
			})
		}

		return options
	}, [results, users])

	const nameFilter = getStringFilterValue(columnFilters, 'name')
	const typeFilter = getArrayFilterValue(columnFilters, 'type')
	const statusFilter = getArrayFilterValue(columnFilters, 'status')
	const newFilter = getArrayFilterValue(columnFilters, 'new')
	const assigneeFilter = getArrayFilterValue(columnFilters, 'assignee')

	const hasActiveFilters =
		nameFilter.length > 0 ||
		typeFilter.length > 0 ||
		statusFilter.length > 0 ||
		newFilter.length > 0 ||
		assigneeFilter.length > 0

	return (
		<div className="flex flex-1 items-center gap-2">
			<Input
				placeholder="Filter tests..."
				value={nameFilter}
				onChange={(event) => {
					setStringFilterValue(
						setColumnFilters,
						'name',
						event.target.value
					)
				}}
				className="h-8 w-[220px]"
			/>

			<MultiSelectFilter
				label="Type"
				options={typeOptions}
				selectedValues={typeFilter}
				onChange={(value) => {
					setArrayFilterValue(setColumnFilters, 'type', value)
				}}
			/>

			<MultiSelectFilter
				label="Status"
				options={statusOptions}
				selectedValues={statusFilter}
				onChange={(value) => {
					setArrayFilterValue(setColumnFilters, 'status', value)
				}}
			/>

			<MultiSelectFilter
				label="New"
				options={newOptions}
				selectedValues={newFilter}
				onChange={(value) => {
					setArrayFilterValue(setColumnFilters, 'new', value)
				}}
			/>

			<MultiSelectFilter
				label="Assignee"
				options={assigneeOptions}
				selectedValues={assigneeFilter}
				onChange={(value) => {
					setArrayFilterValue(setColumnFilters, 'assignee', value)
				}}
			/>

			{hasActiveFilters ? (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setColumnFilters([])}
					className="h-8 px-2 lg:px-3"
				>
					Reset
					<IconX className="size-4" />
				</Button>
			) : null}
		</div>
	)
}

function MultiSelectFilter({
	label,
	options,
	selectedValues,
	onChange,
}: {
	label: string
	options: FilterOption[]
	selectedValues: string[]
	onChange: (value: string[]) => void
}) {
	const selectedLabels = options
		.filter((option) => selectedValues.includes(option.value))
		.map((option) => option.label)

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-8 border-dashed"
				>
					<IconFilter2 className="size-3" />
					{label}
					{selectedValues.length > 0 ? (
						<>
							<span className="mx-1 h-4 w-px bg-border" />

							{selectedValues.length <= 2 ? (
								<div className="flex items-center gap-1">
									{selectedLabels.map((selectedLabel) => (
										<Badge
											key={selectedLabel}
											variant="secondary"
											className="rounded-sm px-1 font-normal"
										>
											{selectedLabel}
										</Badge>
									))}
								</div>
							) : (
								<Badge
									variant="secondary"
									className="rounded-sm px-1 font-normal"
								>
									{selectedValues.length}
								</Badge>
							)}
						</>
					) : null}
				</Button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" className="w-max min-w-[10rem]">
				{options.map((option) => {
					const isChecked = selectedValues.includes(option.value)

					return (
						<DropdownMenuItem
							key={option.value}
							onSelect={(event) => {
								event.preventDefault()

								if (!isChecked) {
									onChange([...selectedValues, option.value])
									return
								}

								onChange(
									selectedValues.filter(
										(value) => value !== option.value
									)
								)
							}}
							className="gap-2 p-2"
						>
							<Checkbox checked={isChecked} />
							<span className="flex flex-1 items-center gap-2 whitespace-nowrap">
								{option.icon}
								{option.label}
							</span>

							<span className="ml-3 text-muted-foreground">
								{option.count}
							</span>
						</DropdownMenuItem>
					)
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

type FilterOption = {
	label: string
	value: string
	count: number
	icon?: React.ReactNode
}

function getStringFilterValue(
	columnFilters: ColumnFiltersState,
	id: string
): string {
	const filterValue = columnFilters.find((filter) => filter.id === id)?.value

	return typeof filterValue === 'string' ? filterValue : ''
}

function getArrayFilterValue(
	columnFilters: ColumnFiltersState,
	id: string
): string[] {
	const filterValue = columnFilters.find((filter) => filter.id === id)?.value

	return Array.isArray(filterValue)
		? filterValue.filter(
				(value): value is string => typeof value === 'string'
			)
		: []
}

function setStringFilterValue(
	setColumnFilters: Dispatch<SetStateAction<ColumnFiltersState>>,
	id: string,
	value: string
) {
	setColumnFilters((previous) => {
		const withoutCurrent = previous.filter((filter) => filter.id !== id)

		if (!value.trim()) {
			return withoutCurrent
		}

		return [...withoutCurrent, { id, value }]
	})
}

function setArrayFilterValue(
	setColumnFilters: Dispatch<SetStateAction<ColumnFiltersState>>,
	id: string,
	value: string[]
) {
	setColumnFilters((previous) => {
		const withoutCurrent = previous.filter((filter) => filter.id !== id)

		if (!value.length) {
			return withoutCurrent
		}

		return [...withoutCurrent, { id, value }]
	})
}
