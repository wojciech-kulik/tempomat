import authenticator from '../config/authenticator'
import { AxiosError, AxiosResponse } from 'axios'
import tempoAxios from './tempoAxios'
import flags from '../globalFlags'
import { appName } from '../appName'

export type AddWorklogRequest = {
    issueId: string;
    timeSpentSeconds: number;
    startDate: string;
    startTime: string;
    description?: string;
    remainingEstimateSeconds?: number
}

export type GetWorklogsRequest = {
    fromDate: string;
    toDate: string;
}

export type GetUserScheduleRequest = {
    fromDate: string;
    toDate: string;
}

export type GetUserScheduleResponse = {
    results: ScheduleEntity[];
}

export type ScheduleEntity = {
    date: string;
    requiredSeconds: number;
    type: string;
}

export type GetWorklogsResponse = {
    results: WorklogEntity[];
}

export type WorklogEntity = {
    tempoWorklogId: string;
    startDate: string;
    startTime: string;
    author: AuthorEntity;
    issue: IssueEntity;
    description: string;
    timeSpentSeconds: number;
}

export type AuthorEntity = {
    accountId: string;
}

export type IssueEntity = {
    self: string;
    id: string;
}

export default {

    async addWorklog(request: AddWorklogRequest): Promise<WorklogEntity> {
        const credentials = await authenticator.getCredentials()
        const body = { ...request, authorAccountId: credentials.accountId }
        return execute(async () => {
            const response = await tempoAxios.post('/worklogs', body)
            debugLog(response)
            return response.data
        })
    },

    async deleteWorklog(worklogId: number) {
        return execute(async () => {
            const response = await tempoAxios.delete(`/worklogs/${worklogId}`)
            debugLog(response)
        })
    },

    async getWorklog(worklogId: number): Promise<WorklogEntity> {
        return execute(async () => {
            const response = await tempoAxios.get(`/worklogs/${worklogId}`)
            debugLog(response)
            return response.data
        })
    },

    async getWorklogs(request: GetWorklogsRequest): Promise<GetWorklogsResponse> {
        const credentials = await authenticator.getCredentials()
        return execute(async () => {
            const response = await tempoAxios.get(`/worklogs/user/${credentials.accountId}`, {
                params: { from: request.fromDate, to: request.toDate, limit: 1000 }
            })
            debugLog(response)
            const allResults = await fetchPaginatedResults<WorklogEntity>(response.data.results, response)
            return { results: allResults }
        })
    },

    async getUserSchedule(request: GetUserScheduleRequest): Promise<GetUserScheduleResponse> {
        return execute(async () => {
            const response = await tempoAxios.get('/user-schedule', {
                params: { from: request.fromDate, to: request.toDate }
            })
            debugLog(response)
            return {
                results: response.data.results
            }
        })
    }
}

async function fetchPaginatedResults<T>(acc: T[], response: AxiosResponse): Promise<T[]> {
    const nextPageUrl = response.data.metadata.next
    if (nextPageUrl) {
        const response = await tempoAxios.get(nextPageUrl)
        debugLog(response)
        const nextPageResults = await fetchPaginatedResults<T>(response.data.results, response)
        return acc.concat(nextPageResults)
    } else {
        return acc
    }
}

function debugLog(response: AxiosResponse) {
    if (flags.debug) {
        console.log(`Request: ${JSON.stringify(response.config)}, Response: ${JSON.stringify(response.data)}`)
    }
}

async function execute<T>(action: () => Promise<T>): Promise<T> {
    return action().catch((e) => handleError(e))
}

function handleError(e: AxiosError): never {
    if (flags.debug) console.log(`Response: ${JSON.stringify(e.response?.data)}`)
    const responseStatus = e.response?.status
    if (responseStatus === 401) {
        throw Error(`Unauthorized access. Token is invalid or has expired. Run ${appName} setup to configure access.`)
    }
    const errorMessages = e.response?.data?.errors?.map((err: { message?: string }) => err.message)
    if (errorMessages) {
        throw Error(`Failure. Reason: ${e.message}. Errors: ${errorMessages.join(', ')}`)
    } else {
        if (flags.debug) console.log(e.toJSON())
        let errorMessage = 'Error connecting to server.'
        if (responseStatus) errorMessage += ` Server status code: ${responseStatus}.`
        throw Error(errorMessage)
    }
}
