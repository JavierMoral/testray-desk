'use client'

import { IconPointFilled } from '@tabler/icons-react'
import {
	ColumnDef,
	ColumnFiltersState,
	PaginationState,
	VisibilityState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	useReactTable,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'

import { Filters } from '@/components/test-table/filters'

import { getStatusBadge } from '@/lib/test-status'
import { getTypeIcon, getTypeLabel } from '@/lib/test-type'

import { TestResult } from '@/types/test-result'
import { Build, Routine } from '@/types/testray'
import { User } from '@/types/user'

import { ActionsMenu } from './actions-menu'
import { AssigneeSelect } from './assignee-select'
import { ColumnCustomizer } from './column-customizer'
import { CommentInput } from './comment-input'
import { ExportButton } from './export-button'
import { History } from './history'
import { Pagination } from './pagination'

export function TestTable({
	results,
	users,
	routineId,
	build,
}: {
	results: TestResult[]
	users: User[]
	routineId: Routine['id']
	build: { id: Build['id']; date: string; gitHash: string }
}) {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 50,
	})

	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
		errors: false,
	})

	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

	const columns = useMemo<ColumnDef<TestResult>[]>(
		() => [
			{
				accessorKey: 'type',
				header: 'Type',
				filterFn: (row, id, value: string[]) => {
					if (!value?.length) {
						return true
					}

					return value.includes(String(row.getValue(id)))
				},
				cell: ({ row }) => <TestType type={row.original.type} />,
			},
			{
				accessorKey: 'status',
				header: 'Status',
				filterFn: (row, id, value: string[]) => {
					if (!value?.length) {
						return true
					}

					return value.includes(String(row.getValue(id)))
				},
				cell: ({ row }) => getStatusBadge(row.original.status),
			},
			{
				accessorKey: 'isNew',
				id: 'new',
				header: '',
				filterFn: (row, id, value: string[]) => {
					if (!value?.length) {
						return true
					}

					const isNew = row.getValue<boolean>(id)

					return value.includes(isNew ? 'yes' : 'no')
				},
				cell: ({ row }) =>
					row.original.isNew ? (
						<Badge
							variant="outline"
							className="px-1.5 text-muted-foreground"
						>
							<IconPointFilled className="fill-yellow-500" />
							New
						</Badge>
					) : null,
			},
			{
				accessorKey: 'name',
				header: 'Name',
				cell: ({ row }) => (
					<div>
						<code className="inline-block max-w-full overflow-hidden whitespace-normal break-all rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-destructive">
							{row.original.name}
						</code>
					</div>
				),
			},
			{
				accessorKey: 'errors',
				header: 'Trace',
				cell: ({ row }) =>
					row.original.errors ? (
						<pre className="max-h-32 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted p-2 font-mono text-xs">
							{row.original.errors}
						</pre>
					) : null,
			},
			{
				accessorKey: 'history',
				header: 'History',
				cell: ({ row }) => (
					<History testResult={row.original} routineId={routineId} />
				),
			},
			{
				accessorKey: 'comment',
				header: 'Comment',
				cell: ({ row }) => (
					<CommentInput
						testResult={row.original}
						routineId={routineId}
					/>
				),
			},
			{
				accessorKey: 'assignee',
				header: 'Assignee',
				filterFn: (row, _id, value: string[]) => {
					if (!value?.length) {
						return true
					}

					const userId = row.original.userId

					const key =
						userId && userId !== 0 ? String(userId) : 'unassigned'

					return value.includes(key)
				},
				cell: ({ row }) => (
					<AssigneeSelect
						testResult={row.original}
						users={users}
						routineId={routineId}
					/>
				),
			},
			{
				id: 'actions',
				header: '',
				enableHiding: false,
				cell: ({ row }) => (
					<div className="flex justify-end">
						<ActionsMenu testResult={row.original} />
					</div>
				),
			},
		],
		[users, routineId]
	)

	const table = useReactTable({
		data: results,
		columns,
		onPaginationChange: setPagination,
		onColumnFiltersChange: setColumnFilters,
		onColumnVisibilityChange: setColumnVisibility,
		state: {
			pagination,
			columnFilters,
			columnVisibility,
		},
		getRowId: (row) => String(row.caseId),
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	})

	const visibleItems = table
		.getFilteredRowModel()
		.rows.map((row) => row.original)

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-2">
				<Filters
					results={results}
					users={users}
					columnFilters={columnFilters}
					setColumnFilters={setColumnFilters}
				/>

				<div className="flex items-center gap-2">
					<ExportButton results={visibleItems} build={build} />

					<ColumnCustomizer
						table={table}
						columnVisibility={columnVisibility}
						setColumnVisibility={setColumnVisibility}
					/>
				</div>
			</div>

			<div className="rounded-lg border">
				<Table>
					<TableHeader className="bg-muted/50">
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead
										key={header.id}
										className="p-3 font-semibold"
										style={getCellStyle(header.column.id)}
									>
										{flexRender(
											header.column.columnDef.header,
											header.getContext()
										)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>

					<TableBody>
						{table.getRowModel().rows.map((row) => (
							<TableRow key={row.id}>
								{row.getVisibleCells().map((cell) => (
									<TableCell
										key={cell.id}
										className="p-3"
										style={getCellStyle(cell.column.id)}
									>
										{flexRender(
											cell.column.columnDef.cell,
											cell.getContext()
										)}
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<Pagination
				table={table}
				total={visibleItems.length}
				pagination={pagination}
				setPagination={setPagination}
			/>
		</div>
	)
}

function TestType({ type }: { type: TestResult['type'] }) {
	const icon = getTypeIcon(type, 20)
	const label = getTypeLabel(type)

	return (
		<Badge variant="outline" className="px-1.5 text-muted-foreground">
			{icon}

			{label}
		</Badge>
	)
}

function getCellStyle(id: string) {
	if (id === 'name') {
		return { minWidth: '200px', maxWidth: '500px' }
	}

	if (id === 'errors') {
		return { width: '400px', minWidth: '400px', maxWidth: '400px' }
	}

	if (id === 'comment') {
		return { width: '320px', minWidth: '320px', maxWidth: '320px' }
	}

	if (id === 'assignee') {
		return { width: '260px', minWidth: '260px', maxWidth: '260px' }
	}

	return undefined
}
