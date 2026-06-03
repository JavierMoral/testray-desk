export default function Page() {
	return (
		<div className="flex min-h-[calc(100dvh-4rem)] items-start justify-center p-6 pt-16 md:pt-24">
			<div className="mx-auto max-w-3xl text-center">
				<p className="text-4xl font-semibold tracking-tight md:text-4xl">
					Welcome!
				</p>
				<p className="mt-4 text-xl text-muted-foreground md:text-2xl">
					Select a routine from the sidebar to get started.
				</p>
			</div>
		</div>
	)
}
