import { createStyles, Group, Input, MultiSelect, Select } from '@mantine/core'
import debounce from 'lodash.debounce'
import { useMemo } from 'react'
import { forwardRef, useEffect, useState } from 'react'
import { ChevronDown, Menu2, Search } from 'tabler-icons-react'
import { getAllCommittees } from '../services/Committees'
import { ICommittee } from '../types/types'
import StatusTypes from '../utils/enums'
import constructSearchFilterQuery from '../utils/filter'
import { getIconForStatus, getStatusTranslation } from '../utils/status'

const useStyles = createStyles((theme) => ({
	filterWrapper: {
		padding: '0',
		display: 'flex',
		gap: '1rem',
		flexDirection: 'column',
		width: '100%',
		alignItems: 'center',
		marginBottom: '1rem',
	},
	searchWrapper: {
		display: 'flex',
		flexDirection: 'column',
		justifyContent: 'center',
		width: '60%',
		'@media (max-width: 600px)': {
			width: '80%',
		},
		'@media (min-width: 600px)': {
			width: '70%',
		},
		'@media (min-width: 1200px)': {
			width: '50%',
		},
	},
	searchInputRoot: {
		width: '100%',
	},
	searchInput: {
		border: '2px solid' + theme.colors.ntnui_yellow[9],
		backgroundColor: theme.colors.ntnui_background[9],
		borderRadius: theme.radius.sm,
	},
	searchInputField: {
		color: 'white',
		'&:focus': {
			border: '2px solid' + theme.colors.ntnui_yellow[9],
		},
	},
	withIcon: {
		color: 'white',
	},
	selectLabel: {
		color: 'black',
	},
	multiselectInput: {
		background: 'transparent',
		color: 'white',
	},
	multiselectValue: {
		background: theme.colors.ntnui_yellow[9],
		color: theme.colors.ntnui_background[9],
	},
	selectInput: {
		background: 'transparent',
		color: 'white',
	},
	badgeLabel: {
		color: 'white',
	},
	filterPreview: {
		marginBottom: '1rem',
		display: 'grid',
		gap: '0.5rem',
		columnGap: '2rem',
		gridTemplateColumns: '1fr 1fr',
		'@media (max-width: 600px)': {
			width: '90%',
			display: 'flex',
			flexDirection: 'column',
			gap: '0.5rem',
		},
		'@media (min-width: 600px)': {
			width: '80%',
		},
		'@media (min-width: 1200px)': {
			width: '70%',
			columnGap: '4rem',
		},
	},
	filterBadgesWrapper: {
		display: 'flex',
		gap: '0.5rem',
		alignItems: 'center',
		flexWrap: 'wrap',
	},
	multiselectRoot: {
		gridColumn: '1 / 3',
	},
	selectRightSection: {
		pointerEvents: 'none',
	},
}))

interface StatusTypesData {
	value: string
	label: string
}

function mapStatusTypeToSelectData(): StatusTypesData[] {
	const statusTypesArray: StatusTypesData[] = Object.values(StatusTypes).map(
		(status: StatusTypes) => {
			return { label: getStatusTranslation(status), value: status }
		}
	)
	statusTypesArray.unshift({ label: 'Alle', value: '' })
	return statusTypesArray
}

export type FilterSearchProps = {
	setFilter: (filter: string) => void
}

function FilterSearch({ setFilter }: FilterSearchProps) {
	const { classes } = useStyles()
	const [committees, setCommittees] = useState<ICommittee[]>([])
	const [chosenCommittees, setChosenCommittees] = useState<string[]>([])
	const [filterCommittees, setFilterCommittees] = useState<string[]>([])
	const [status, setStatus] = useState<string>('')
	const [sort, setSort] = useState<string>('date_desc')
	const [nameSearch, setNameSearch] = useState<string>('')

	useEffect(() => {
		// Retrieve committees for multiselect
		async function getCommittees() {
			try {
				let allCommittees: ICommittee[] = []
				allCommittees = await getAllCommittees()
				setCommittees(allCommittees)
			} catch (error: any) {}
		}
		getCommittees()
	}, [])

	// Debouncing nameSearch
	const handleChangeFilter = useMemo(
		() =>
			debounce((query) => {
				setFilter(query.toString())
			}, 300),
		[setFilter]
	)

	useEffect(() => {
		return () => {
			handleChangeFilter.cancel()
		}
	}, [handleChangeFilter])

	// Update filter with nameSearch using debouncer
	useEffect(() => {
		let query = constructSearchFilterQuery(
			filterCommittees,
			sort,
			status,
			nameSearch
		)
		handleChangeFilter(query)
	}, [nameSearch, setFilter, handleChangeFilter])

	// Update filter with other fields on input-change
	useEffect(() => {
		let query = constructSearchFilterQuery(
			filterCommittees,
			sort,
			status,
			nameSearch
		)
		setFilter(query.toString())
	}, [status, filterCommittees, sort, setFilter])

	function mapCommitteesToMultiselectData() {
		let dataList: { value: string; label: string }[] = []
		committees.forEach((committee: ICommittee) => {
			dataList.push({ value: `${committee._id}`, label: committee.name })
		})
		return dataList
	}

	interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
		label: string
		value: StatusTypes
	}

	const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
		({ label, value, ...others }: ItemProps, ref) => (
			<div ref={ref} {...others}>
				<Group noWrap>
					{getFilterStatusIcon(value)}
					{label}
				</Group>
			</div>
		)
	)

	function getFilterStatusIcon(status: string) {
		if (status === '') {
			return <Menu2 />
		} else {
			return getIconForStatus(status)
		}
	}

	return (
		<div className={classes.filterWrapper}>
			<div className={classes.searchWrapper}>
				<Input
					classNames={{
						wrapper: classes.searchInputRoot,
						defaultVariant: classes.searchInput,
						input: classes.searchInputField,
						withIcon: classes.withIcon,
					}}
					value={nameSearch}
					onChange={(e: any) => setNameSearch(e.target.value)}
					icon={<Search />}
					variant='default'
					placeholder='Søk etter søker ...'
					size='md'
				/>
			</div>
			<div className={classes.filterPreview}>
				<Select
					classNames={{
						label: classes.selectLabel,
						input: classes.selectInput,
						rightSection: classes.selectRightSection,
					}}
					data={mapStatusTypeToSelectData()}
					itemComponent={SelectItem}
					icon={getFilterStatusIcon(status)}
					label={<span className={classes.badgeLabel}>Velg status</span>}
					defaultValue={''}
					value={status}
					onChange={(e) => setStatus(e as string)}
					rightSection={<ChevronDown size={14} />}
					rightSectionWidth={40}
				/>

				<Select
					classNames={{
						label: classes.selectLabel,
						input: classes.selectInput,
						rightSection: classes.selectRightSection,
					}}
					data={[
						{ value: 'date_desc', label: 'Nyeste først', group: 'Dato' },
						{ value: 'date_asc', label: 'Eldste først', group: 'Dato' },
						{ value: 'name_asc', label: 'A-Z', group: 'Alfabetisk' },
						{ value: 'name_desc', label: 'Z-A', group: 'Alfabetisk' },
					]}
					label={<span className={classes.badgeLabel}>Sorter etter</span>}
					defaultValue={'date_desc'}
					size='sm'
					value={sort}
					onChange={(e) => setSort(e as string)}
					rightSection={<ChevronDown size={14} />}
					rightSectionWidth={40}
				/>
				<MultiSelect
					classNames={{
						root: classes.multiselectRoot,
						input: classes.multiselectInput,
						value: classes.multiselectValue,
					}}
					data={mapCommitteesToMultiselectData()}
					label={<span className={classes.badgeLabel}>Velg utvalg</span>}
					placeholder='Velg utvalg'
					searchable
					clearable
					nothingFound='Nothing found'
					onDropdownClose={() => setFilterCommittees(chosenCommittees)}
					value={chosenCommittees}
					onChange={setChosenCommittees}
					rightSectionWidth={40}
				/>
			</div>
		</div>
	)
}

export default FilterSearch
