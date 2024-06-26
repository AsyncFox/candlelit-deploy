import { ofetch } from 'ofetch';
import { ZeroWidth } from '~/utils/zerowidth';
import type {
  TNewOrder,
  TOrder,
  TSeiueAuthResponse,
  TSeiueCalenderEventResponse,
  TSeiueMyOrdersResponse,
  TSeiueOrderDetailResponse,
  TSeiueOrderTimesResponse,
  TSeiueVenueResponse,
  TTimeRangeItem,
  TVenueList,
} from '~/types';
import { getMondayThisWeek, getSundayTwoWeeksLater, splitCommaSeparatedString } from '~/utils/shared';
import { SEIUE_API_URL, SEIUE_CHALK_URL, SEIUE_PASSPORT_URL, candlelitMark } from '~/constants';

export function cookiesParser(cookies: string[]) {
  const parsedCookies: Record<string, string> = {};
  for (const cookie of cookies) {
    const [content, ..._options] = cookie.split(';');
    const [name, value] = content.split('=');
    parsedCookies[name] = value;
  }
  return parsedCookies;
}

export interface TCredentials { schoolId: string; password: string };
export interface TDirectCredentials { accessToken: string; activeReflectionId: number }

export class Seiue {
  private accessToken: string;
  private activeReflectionId: number;
  private fetcher: typeof ofetch;
  private zeroWidth = new ZeroWidth();

  constructor({ accessToken, activeReflectionId }: TDirectCredentials) {
    this.accessToken = accessToken;
    this.activeReflectionId = activeReflectionId;
    this.fetcher = ofetch.create({
      headers: {
        'authorization': `Bearer ${this.accessToken}`,
        'x-reflection-id': this.activeReflectionId.toString(),
        // 'x-role': 'student', // seems not needed
        'x-school-id': '282',
        'referer': SEIUE_CHALK_URL,
      },
      retry: 2,
      retryDelay: 50,
    });
  }

  static async init(credentials: TCredentials): Promise<Seiue> {
    const loginRes = await this.login(credentials);
    if (!loginRes)
      throw new Error('登录失败');
    return new Seiue({
      accessToken: loginRes.accessToken,
      activeReflectionId: loginRes.activeReflectionId,
    });
  }

  static async login(credentials: TCredentials) {
    try {
      const { schoolId, password } = credentials;
      const loginRes = await ofetch.raw(`${SEIUE_PASSPORT_URL}/login?school_id=282`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        redirect: 'manual',
        body: new URLSearchParams({ email: schoolId, password, school_id: '282', submit: '提交' }),
      });
      const cookies = cookiesParser(loginRes.headers.getSetCookie());
      const authorizeRes = await this.retrieveToken(cookies);
      return {
        accessToken: authorizeRes.access_token,
        activeReflectionId: authorizeRes.active_reflection_id,
        cookies,
      };
    } catch {
      return null;
    }
  }

  user() {
    return { accessToken: this.accessToken, activeReflectionId: this.activeReflectionId };
  }

  static async retrieveToken(cookies: Record<string, string>) {
    return ofetch<TSeiueAuthResponse>(`${SEIUE_PASSPORT_URL}/authorize`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'origin': SEIUE_CHALK_URL,
        'referer': SEIUE_CHALK_URL,
        'cookie': Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; '),
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
      },
      body: new URLSearchParams({ client_id: 'GpxvnjhVKt56qTmnPWH1sA', response_type: 'token' }),
    });
  }

  static async checkTokenStatus(accessToken: string) {
    try {
      await ofetch(`${SEIUE_API_URL}/chalk/oauth/info`, {
        method: 'HEAD',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves calendar events for the specified venue IDs.
   *
   * Venue IDs will be split into groups of `splitSize` to avoid too large response and loss of data.
   *
   * @param venueIds - The IDs of the venues to retrieve calendar events for.
   * @param splitSize - The number of venue IDs to include in each API request. Defaults to 1.
   */
  async getCalendarEvents(venueIds: string, splitSize: number = 1): Promise < TSeiueCalenderEventResponse > {
    const venueIdGroups = splitCommaSeparatedString(venueIds, splitSize);
    const calendarEvents = await Promise.all(
      venueIdGroups.map(
        venueIds =>
          this.fetcher<TSeiueCalenderEventResponse>(`${SEIUE_API_URL}/scms/venue/venues/calendar-events`, {
            params: {
              end_time: getSundayTwoWeeksLater(),
              start_time: getMondayThisWeek(),
              venue_id_in: venueIds,
            },
            method: 'GET',
          }),
      ),
    );
    return calendarEvents.flat();
  }

  /**
   * Retrieves the order times for the specified venue IDs.
   *
   * Venue IDs will be split into groups of `splitSize` to avoid too large response and loss of data.
   *
   * @param venueIds - The IDs of the venues to retrieve order times for.
   * @param splitSize - The number of venue IDs to include in each API request. Defaults to 1.
   */
  async getOrderTimes(venueIds: string, splitSize: number = 1): Promise<TSeiueOrderTimesResponse> {
    const venueIdGroups = splitCommaSeparatedString(venueIds, splitSize);
    // const timeGroups = [
    //   { startAt: getMondayThisWeek(), endAt: getSundayThisWeek() },
    //   { startAt: getMondayNextWeek(), endAt: getSundayNextWeek() },
    //   { startAt: getMondayTwoWeeksLater(), endAt: getSundayTwoWeeksLater() },
    // ];
    // // for each venueIdGroup, iterate through timeGroups and get the order times
    // const orderTimes = [];
    // for (const venueIds of venueIdGroups) {
    //   for (const { startAt, endAt } of timeGroups) {
    //     const orderTimesForGroup = await this.fetcher<TSeiueOrderTimesResponse>(`${SEIUE_API_URL}/scms/venue/order-times`, {
    //       params: {
    //         end_at_elt: endAt,
    //         start_at_egt: startAt,
    //         status: 'initiated',
    //         venue_id_in: venueIds,
    //       },
    //       method: 'GET',
    //     });
    //     orderTimes.push(...orderTimesForGroup);
    //   }
    // }
    // return orderTimes;

    const orderTimes = await Promise.all(
      venueIdGroups.map(
        venueIds =>
          this.fetcher<TSeiueOrderTimesResponse>(`${SEIUE_API_URL}/scms/venue/order-times`, {
            params: {
              end_at_elt: getSundayTwoWeeksLater(),
              start_at_egt: getMondayThisWeek(),
              status: 'initiated',
              venue_id_in: venueIds,
            },
            method: 'GET',
          }),
      ),
    );
    return orderTimes.flat();
  }

  async getVenueList(): Promise < TVenueList > {
    const venueRes = await this.fetcher<TSeiueVenueResponse>(`${SEIUE_API_URL}/scms/venue/order-venues`, {
      method: 'GET',
      params: {
        expand: 'places,place_ids',
        need_select_follower: true,
        only_empty_time: false,
        page: 1,
        per_page: 100,
        sort: '-vf_id,-id',
        type_id_in: 32008,
      },
    });
    const venues = venueRes.map(({ id, name, open_time_ranges }) => {
      const [building, floor] = name.match(/([A-Z])(\d)/)?.slice(1) ?? [];
      return {
        id,
        name,
        building: building as 'A' | 'B' | 'C' | 'D',
        floor: floor as string,
        openTimeRanges: open_time_ranges.map(({ ranges, week_days }) => ({
          ranges: ranges.map(({ start_at, end_at }) => ({ startAt: start_at, endAt: end_at })),
          weekDays: week_days,
        })),
        occupiedTimes: [] as TTimeRangeItem[],
      };
    });
    const venueIds = venues.map(({ id }) => id).join(',');
    const calendarEvents = await this.getCalendarEvents(venueIds);
    const orderTimes = await this.getOrderTimes(venueIds);
    for (const { venue_id, events } of calendarEvents) {
      const venue = venues.find(({ id }) => id === venue_id)!;
      venue.occupiedTimes.push(...events.map(({ start_time, end_time }) => ({ startAt: start_time, endAt: end_time })));
    }
    for (const { venue_id, start_at, end_at } of orderTimes) {
      const venue = venues.find(({ id }) => id === venue_id)!;
      venue.occupiedTimes.push({ startAt: start_at, endAt: end_at });
    }
    return venues;
  }

  async createOrder(order: TNewOrder): Promise < TOrder > {
    const res = await this.fetcher<TSeiueOrderDetailResponse>(`${SEIUE_API_URL}/scms/venue/order-venues/${order.venue.id}/orders`, {
      method: 'POST',
      body: {
        type: 'single_day',
        time_ranges: [{ start_at: order.timeRanges.startAt, end_at: order.timeRanges.endAt }],
        capacity: order.capacity,
        // hide candlelitMark in order description
        description: this.zeroWidth.zeroEncode(order.description, candlelitMark),
        date_ranges: {
          start_at: order.dateRanges.startAt,
          end_at: order.dateRanges.endAt,
        },
      },
    });
    return {
      id: res.id,
      capacity: res.capacity,
      description: res.description,
      timeRanges: res.time_ranges.map(({ start_at, end_at }) => ({ startAt: start_at, endAt: end_at })),
      venueId: res.venue_id,
      isCandlelit: true, // always true
    };
  }

  async getOrderDetail(orderId: number): Promise < TOrder > {
    const res = await this.fetcher<TSeiueOrderDetailResponse>(`${SEIUE_API_URL}/scms/venue/orders/${orderId}`);

    return {
      id: res.id,
      capacity: res.capacity,
      description: res.description,
      timeRanges: res.time_ranges.map(({ start_at, end_at }) => ({ startAt: start_at, endAt: end_at })),
      venueId: res.venue_id,
      isCandlelit: this.zeroWidth.zeroDecode(res.description) === candlelitMark,
    };
  }

  async getMyOrders(): Promise < TOrder[] > {
    const res = await this.fetcher<TSeiueMyOrdersResponse>(`${SEIUE_API_URL}/scms/venue/my-orders`, {
      params: {
        expand: 'order_times,venue',
        page: 1,
        per_page: 100,
      },
      method: 'GET',
    });
    return res.map(({ id, capacity, description, time_ranges, venue_id }) => ({
      id,
      capacity,
      description,
      timeRanges: time_ranges.map(({ start_at, end_at }) => ({ startAt: start_at, endAt: end_at })),
      venueId: venue_id,
      isCandlelit: this.zeroWidth.zeroDecode(description) === candlelitMark,
    }));
  }

  async cancelOrder(orderId: number) {
    try {
      await this.fetcher(`${SEIUE_API_URL}/scms/venue/candel-orders/${orderId}`, {
        method: 'PUT',
      });
      return { success: true as const, message: '取消成功' };
    } catch {
      return { success: false as const, message: '取消失败' };
    }
  }
}
