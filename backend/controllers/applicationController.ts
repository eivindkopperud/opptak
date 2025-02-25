import { NextFunction, Request, Response } from 'express'
import { CustomError, UnauthorizedUserError } from 'ntnui-tools/customError'
import { validationResult, ValidationError } from 'express-validator'
import { RequestWithNtnuiNo } from '../utils/request'
import { ApplicationModel, IApplication } from '../models/Application'
import { UserModel } from '../models/User'
import { CommitteeModel, ICommittee } from '../models/Committee'
import isAdmissionPeriodActive from '../utils/isAdmissionPeriodActive'
import { SortTypes, StatusTypes } from '../utils/enums'
import { IStatus, StatusModel } from '../models/Status'
import { AdmissionPeriodModel } from '../models/AdmissionPeriod'
import { getSortTypeValue } from '../utils/applicationQueryMiddleware'
import { ELECTION_COMMITTEE_ID, MAIN_BOARD_ID } from '../utils/constants'

async function getUserCommitteeIdsByUserId(userId: number | string) {
	let committeeIds: number[] = []
	await UserModel.findById(userId)
		.then((user) => {
			if (user) {
				committeeIds = user.committees.map((committee) => committee.committee)
			}
		})
		.catch(() => {
			throw new CustomError('Something went wrong when trying to find user', 500)
		})
	return committeeIds
}

interface IPopulatedApplicationCommittees
	extends Omit<IApplication, 'committees'> {
	committees: ICommittee[]
}

interface IPopulatedApplicationCommitteesAndStatus
	extends Omit<IPopulatedApplicationCommittees, 'statuses'> {
	statuses: IStatus[]
}

const getApplicationById = async (
	req: RequestWithNtnuiNo,
	res: Response,
	next: NextFunction
) => {
	try {
		// Access control - retrieve committees that user is member of
		const { ntnuiNo } = req
		if (!ntnuiNo) throw UnauthorizedUserError
		const userCommitteeIds: number[] = await getUserCommitteeIdsByUserId(ntnuiNo)

		if (!userCommitteeIds) {
			return res
				.status(403)
				.json({ message: 'The user is not member of any committee' })
		}

		// Retrieve application and committees the application is sent to
		const application = await ApplicationModel.findById(req.params.application_id)
			.populate<IPopulatedApplicationCommittees>('committees', 'name slug')
			.populate({
				path: 'statuses',
				populate: { path: 'committee', model: 'Committee', select: 'name' },
				select: '-__v',
			})
			.then((applicationRes) => applicationRes)
			.catch(() => {
				throw new CustomError('Could not find application', 404)
			})
		if (!application) throw new CustomError('Could not find application', 404)

		// Election committee are allowed to see all applied committees
		if (userCommitteeIds.includes(ELECTION_COMMITTEE_ID)) {
			return res.status(200).json({ application })
		}

		const applicationCommittees: ICommittee[] = application.committees
		// Main board are allowed to see all applied committees, but not to the main board
		if (userCommitteeIds.includes(MAIN_BOARD_ID)) {
			for (let i = 0; i < applicationCommittees.length; i += 1) {
				if (applicationCommittees[i]._id === MAIN_BOARD_ID) {
					applicationCommittees.splice(i, 1)
					application.statuses.splice(i, 1)
					break
				}
			}

			if (applicationCommittees.length > 0) {
				return res.status(200).json({ application })
			}
			return res
				.status(403)
				.json({ message: 'You do not have access to this application' })
		}

		let authorized = false
		// Only election committee should see if application includes main board
		for (let id = 0; id < applicationCommittees.length; id += 1) {
			const appCommitteeId = applicationCommittees[id]._id
			if (userCommitteeIds.includes(appCommitteeId)) {
				authorized = true
				// Hide parts with main board
			} else if (appCommitteeId === MAIN_BOARD_ID) {
				applicationCommittees.splice(id, 1)
				application.statuses.splice(id, 1)
				id -= 1
			}
		}
		if (authorized === true) {
			return res.status(200).json({ application })
		}
		throw new CustomError('You do not have access to this application', 403)
	} catch (error) {
		return next(error)
	}
}

const getApplications = async (
	req: RequestWithNtnuiNo,
	res: Response,
	next: NextFunction
) => {
	try {
		// Access control - retrieve committees that user is member of
		const { ntnuiNo } = req
		if (!ntnuiNo) throw UnauthorizedUserError
		const userCommitteeIds: number[] = await getUserCommitteeIdsByUserId(ntnuiNo)

		if (!userCommitteeIds) {
			return res
				.status(403)
				.json({ message: 'The user is not member of any committee' })
		}

		// Validate query parameters
		const errorFormatter = ({ location, msg, param, value }: ValidationError) =>
			`${location}[${param}](Value=${value}): ${msg}`

		const result = validationResult(req).formatWith(errorFormatter)
		if (!result.isEmpty()) {
			return res.status(400).json({ message: result.array() })
		}
		// Retrieve query parameters
		const page: string = req.query.page as string
		const name: string = req.query.name as string
		const committee: string | string[] = req.query.committee as string | string[]
		const status: string = req.query.status as string
		const sortparam: SortTypes = req.query.sort as SortTypes
		const sortValue = getSortTypeValue(sortparam) // Parse sort value

		// Aggregation
		const aggregationPipeline = []
		// Only return applications that are sent to committees that user is authorized to see
		if (userCommitteeIds.includes(ELECTION_COMMITTEE_ID)) {
			// Election committee are allowed to see all applications
		} else if (userCommitteeIds.includes(MAIN_BOARD_ID)) {
			// Main board see all applications except ones only to the main board
			const userAuthorizedCommittees = {
				$match: {
					committees: {
						$ne: [MAIN_BOARD_ID],
					},
				},
			}
			aggregationPipeline.push(userAuthorizedCommittees)
		} else {
			// Normal committees only see applications to their own committee
			const userAuthorizedCommittees = {
				$match: {
					committees: {
						$in: userCommitteeIds,
					},
				},
			}
			aggregationPipeline.push(userAuthorizedCommittees)
		}
		// Query on name
		const queryName = {
			$match: {
				name: {
					$regex: name,
					$options: 'i',
				},
			},
		}
		if (name) aggregationPipeline.push(queryName)

		// Populate status to query on status for committee value
		const populateStatus = {
			$lookup: {
				from: 'statuses',
				localField: 'statuses',
				foreignField: '_id',
				as: 'statuses',
			},
		}
		aggregationPipeline.push(populateStatus)

		// Prepare committees query
		const committeeIds = []
		if (committee) {
			// Parse query parameter to numbers
			if (Array.isArray(committee)) {
				committeeIds.push(...committee.map((id) => parseInt(id, 10)))
			} else {
				committeeIds.push(parseInt(committee, 10))
			}
		}
		// Filter on both status and committees if both query parameters are sent
		if (status && committee) {
			const statusForCommittee = {
				$match: {
					statuses: {
						$elemMatch: {
							committee: {
								$in: committeeIds,
							},
							value: status,
						},
					},
				},
			}
			aggregationPipeline.push(statusForCommittee)
		} else if (status) {
			// Filter only on status
			const filterStatus = {
				$match: {
					statuses: {
						$elemMatch: {
							value: status,
						},
					},
				},
			}
			aggregationPipeline.push(filterStatus)
		} else if (committee) {
			// Filter only on committee(s)
			const filterCommittee = {
				$match: {
					committees: {
						$in: committeeIds,
					},
				},
			}
			aggregationPipeline.push(filterCommittee)
		}

		// Populate committees
		const populateCommittees = {
			$lookup: {
				from: 'committees',
				localField: 'committees',
				foreignField: '_id',
				as: 'committees',
			},
		}
		aggregationPipeline.push(populateCommittees)

		// Sort
		const sort = {
			$sort: sortparam ? (sortValue as 1 | -1) : {},
		}
		if (sortparam) aggregationPipeline.push(sort)

		// Pagination
		const LIMIT = 4
		const startIndex = page ? (Number(page) - 1) * LIMIT : 0
		const pagination = {
			$facet: {
				applications: [{ $skip: startIndex }, { $limit: LIMIT }],
				pagination: [
					{ $count: 'total' },
					{
						$addFields: {
							currentPage: page ? Number(page) : 0,
							numberOfPages: { $ceil: { $divide: ['$total', LIMIT] } },
						},
					},
				],
			},
		}
		aggregationPipeline.push(pagination)

		// Projection to retrieve interesting fields
		const projection = {
			$project: {
				applications: {
					_id: 1,
					name: 1,
					submitted_date: 1,
					committees: {
						_id: 1,
						name: 1,
						slug: 1,
					},
					statuses: {
						committee: 1,
					},
				},
				pagination: {
					$mergeObjects: [
						// Make pagination to an object instead of array
						{
							currentPage: { $arrayElemAt: ['$pagination.currentPage', 0] },
							numberOfPages: { $arrayElemAt: ['$pagination.numberOfPages', 0] },
						},
					],
				},
			},
		}

		aggregationPipeline.push(projection)

		interface IApplicationResponse {
			applications: IPopulatedApplicationCommitteesAndStatus[]
			pagination: {
				currentPage: number
				numberOfPages: number
			}
		}
		// Retrieve applications that following given filter
		const applicationRes = await ApplicationModel.aggregate(aggregationPipeline)
			.exec()
			.then((appRes: IApplicationResponse[]) =>
				appRes[0].applications.length
					? appRes[0]
					: { applications: [], pagination: { currentPage: 1, numberOfPages: 0 } }
			)
			.catch(() => {
				throw new CustomError('Something went wrong retrieving applications', 500)
			})

		const { applications } = applicationRes
		// If application is sent to main board, hide parts with main board
		if (applications && !userCommitteeIds.includes(ELECTION_COMMITTEE_ID)) {
			for (let i = 0; i < applications.length; i += 1) {
				// Remove status and committee if it's main board
				applications[i].committees = applications[i].committees.filter(
					(com) => com._id !== MAIN_BOARD_ID
				)
				applications[i].statuses = applications[i].statuses.filter(
					(stat) => stat.committee !== MAIN_BOARD_ID
				)
			}
		}

		return res.status(200).json(applicationRes)
	} catch (error) {
		return next(error)
	}
}

const postApplication = async (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	try {
		if (!(await isAdmissionPeriodActive())) {
			throw new CustomError('Admission period is not active', 403)
		}
		// Check that all applied committees accepts admissions
		const closedCommittees = await CommitteeModel.findOne({
			_id: { $in: req.body.committees },
			accepts_admissions: false,
		})
		if (closedCommittees) {
			return res
				.status(400)
				.json({ message: 'A committee the application was sent to is closed' })
		}
		// Create a status model for each committee the application is sent to
		const statuses = req.body.committees.map((committee: number) => ({
			committee,
			status: StatusTypes.PENDING,
		}))
		// Insert statuses in database
		const insertedStatuses = await StatusModel.insertMany(statuses, {
			ordered: true,
		})
			.then((statusRes) => statusRes)
			.catch(() => {
				throw new CustomError('Something went wrong creating statuses', 500)
			})
		const statusIds = insertedStatuses.map((stat: IStatus) => stat)
		// Create application
		const application = new ApplicationModel({ ...req.body, statuses: statusIds })
		return application
			.save()
			.then((newApplication) =>
				res.status(200).json({ application: newApplication })
			)
			.catch((err) => {
				if (err.name === 'ValidationError') {
					return res.status(400).json({ message: err.message })
				}
				return res.status(500).json({ message: 'Unable to save application' })
			})
	} catch (error) {
		return next(error)
	}
}

const wipeAdmissionData = async (
	req: RequestWithNtnuiNo,
	res: Response,
	next: NextFunction
) => {
	try {
		const { ntnuiNo } = req
		if (!ntnuiNo) throw UnauthorizedUserError
		const committeeIds: number[] = await getUserCommitteeIdsByUserId(ntnuiNo)
		// Only main board can delete all applications
		if (!committeeIds.includes(MAIN_BOARD_ID)) {
			throw new CustomError('You do not have access to this resource', 403)
		}
		await ApplicationModel.deleteMany({})
		await StatusModel.deleteMany({})
		await UserModel.deleteMany({ _id: { $ne: ntnuiNo } })
		await AdmissionPeriodModel.deleteMany({})
		await CommitteeModel.updateMany({}, { accepts_admissions: false })
		return res.status(200).json({ message: 'Admission data successfully wiped' })
	} catch (error) {
		return next(error)
	}
}

export {
	getApplications,
	postApplication,
	getApplicationById,
	wipeAdmissionData,
}
