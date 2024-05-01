import type { Seiue } from './seiue';
import type { TNewOrder, TNewOrderInput, TSendOrderResult, TSendOrderResultItem, TVenue, TVenueList } from '~/types';

export interface TSortOptions {
  firstSortBy: 'floor' | 'building';
  buildingOrder: { [key: string]: number };
}

export class Booker {
  private seiue: Seiue;
  private venues: TVenueList;

  constructor(seiue: Seiue, venues: TVenueList) {
    this.seiue = seiue;
    this.venues = this.sortVenues(venues);
  }

  static async init(seiue: Seiue): Promise<Booker> {
    const venues = await seiue.getVenueList();
    return new Booker(seiue, venues);
  }

  isTimeRangeValid(startTime: Date, endTime: Date, venue: TVenue): boolean {
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;

    for (const openTimeRange of venue.openTimeRanges) {
      if (openTimeRange.weekDays.includes(startTime.getDay())) {
        for (const range of openTimeRange.ranges) {
          const [openStartHour, openStartMinute] = range.startAt.split(':').map(Number);
          const [openEndHour, openEndMinute] = range.endAt.split(':').map(Number);
          const startAtHour = openStartHour + openStartMinute / 60;
          const endAtHour = openEndHour + openEndMinute / 60;
          if (startAtHour <= startHour && endAtHour >= endHour)
            return true;
        }
      }
    }

    return false;
  }

  async _isVenueAvailable(venueId: number, startTime: string, endTime: string, venueSource: TVenueList = this.venues): Promise<boolean> {
    const venue = venueSource.find(({ id }) => id === venueId);
    if (!venue)
      return false;

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (!this.isTimeRangeValid(start, end, venue))
      return false;

    const unavailableTimes = venue.occupiedTimes.concat(venue.preallocatedTimes ?? []);

    if (unavailableTimes.some((time) => {
      const unavailableStart = new Date(time.startAt);
      const unavailableEnd = new Date(time.endAt);

      // Check if timeRange does not overlap with occupied time range
      return (start >= unavailableStart && start < unavailableEnd)
        || (end > unavailableStart && end <= unavailableEnd);
    }))
      return false;

    return true;
  }

  async findAvailableVenue(startTime: string, endTime: string, venueSource: TVenueList = this.venues): Promise<TVenue> {
    // Find the first available venue
    for (const venue of venueSource) {
      if (await this._isVenueAvailable(venue.id, startTime, endTime, venueSource))
        return venue;
    }
    // If for loop ends without returning, no venue is available
    throw new Error('No venue available');
  }

  async findAvailableVenuesAll(startTime: string, endTime: string, venueSource: TVenueList = this.venues): Promise<TVenueList> {
    const venues = await Promise.all(this.venues.map(async (venue) => {
      return (await this._isVenueAvailable(venue.id, startTime, endTime, venueSource)) ? venue : {} as TVenue;
    }));
    if (venues.length === 0)
      throw new Error('No venue available');
    return venues.filter(venue => venue.id !== undefined);
  }

  sortVenues(
    venues: TVenueList = this.venues,
    options: TSortOptions = { firstSortBy: 'floor', buildingOrder: { B: 0, C: 1, A: 2, D: 3 } },
  ) {
    const { firstSortBy, buildingOrder } = options;

    return venues.toSorted((a, b) => {
      if (firstSortBy === 'floor') {
        // First, sort by floor (lower is better)
        if (a.floor < b.floor)
          return -1;
        if (a.floor > b.floor)
          return 1;

        // Then, sort by building
        return buildingOrder[a.building] - buildingOrder[b.building];
      } else {
        // First, sort by building
        const buildingCompare = buildingOrder[a.building] - buildingOrder[b.building];
        if (buildingCompare !== 0)
          return buildingCompare;

        // Then, sort by floor (lower is better)
        if (a.floor < b.floor)
          return -1;
        if (a.floor > b.floor)
          return 1;
      }

      // If all else fails, return 0 (stable sort)
      return 0;
    });
  }

  /**
   * Sends an order or an array of orders asynchronously.
   *
   * @param orderInput - Order (or array of orders) to be sent.
   * @param concurrency - The number of orders to be processed concurrently. Defaults to 2.
   * @throws An error if no order input is provided.
   */
  async sendOrder(orderInput: TNewOrder): Promise<TSendOrderResultItem>;
  async sendOrder(orderInput: TNewOrder[]): Promise<TSendOrderResult>;
  async sendOrder(orderInput: TNewOrder[] | TNewOrder, concurrency: number = 2): Promise<TSendOrderResult | TSendOrderResultItem> {
    if (!orderInput)
      throw new Error('No order input');

    if (!Array.isArray(orderInput)) {
      try {
        const order = await this.seiue.createOrder(orderInput);
        return {
          success: true,
          message: '创建成功',
          order,
        };
      } catch {
        return {
          success: false,
          message: '创建失败',
          order: orderInput,
        };
      }
    }

    // divide the orders into chunks of concurrency
    // then use promise.allSettled for each chunk
    concurrency = concurrency < 1 ? 1 : concurrency;
    const runResult = [];
    const chunks = [];
    for (let i = 0; i < orderInput.length; i += concurrency)
      chunks.push(orderInput.slice(i, i + concurrency));

    for (const chunk of chunks) {
      const chunkResult = await Promise.allSettled(chunk.map(order => this.seiue.createOrder(order)));
      runResult.push(...chunkResult);
    }

    return runResult.map((result, index) => {
      if (result.status === 'fulfilled') {
        return {
          success: true,
          message: '创建成功',
          order: result.value,
        };
      } else {
        return {
          success: false,
          message: '创建失败',
          order: orderInput[index],
        };
      }
    });
  }

  async generateOrder(orderInput: TNewOrderInput): Promise<TNewOrder> {
    const venue = await this.findAvailableVenue(orderInput.startTime, orderInput.endTime);
    const order = {
      venueId: venue.id,
      capacity: orderInput.capacity,
      description: orderInput.description,
      dateRanges: {
        startAt: orderInput.startTime.split(' ')[0],
        endAt: orderInput.endTime.split(' ')[0],
      },
      timeRanges: [{ startAt: orderInput.startTime, endAt: orderInput.endTime }],
    };
    return order;
  }

  // TODO: merge orders if they are in the same venue and total time length is less than 2 hour
  async bulkGenerateOrder(orderInput: TNewOrderInput[]): Promise<TNewOrder[]> {
    // make a deep copy of the venues and keep the type
    const venues = JSON.parse(JSON.stringify(this.venues)) as TVenueList;

    // for each order, find an available venue and generate an order
    // after generating an order, update the venue's preallocatedTimes
    // run one by one
    const newOrders: TNewOrder[] = [];
    for (const order of orderInput) {
      const venue = await this.findAvailableVenue(order.startTime, order.endTime, venues);
      const newOrder = {
        venueId: venue.id,
        capacity: order.capacity,
        description: order.description,
        dateRanges: {
          startAt: order.startTime.split(' ')[0],
          endAt: order.endTime.split(' ')[0],
        },
        timeRanges: [{ startAt: order.startTime, endAt: order.endTime }],
      };
      newOrders.push(newOrder);
      venue.preallocatedTimes = [
        ...(venue.preallocatedTimes ?? []),
        { startAt: order.startTime, endAt: order.endTime },
      ];
    }
    return newOrders;
  }
}
