import { Logger } from '../../../../cli/Logger.js';
import GlobalOptions from '../../../../GlobalOptions.js';
import request, { CliRequestOptions } from '../../../../request.js';
import { formatting } from '../../../../utils/formatting.js';
import { odata } from '../../../../utils/odata.js';
import GraphCommand from '../../../base/GraphCommand.js';
import commands from '../../commands.js';
import { GroupExtended } from './GroupExtended.js';

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  displayName?: string;
  mailNickname?: string;
  includeSiteUrl?: boolean;
  withSiteUrl?: boolean;
  orphaned?: boolean;
}

class EntraM365GroupListCommand extends GraphCommand {
  public get name(): string {
    return commands.M365GROUP_LIST;
  }

  public get description(): string {
    return 'Lists Microsoft 365 Groups in the current tenant';
  }

  constructor() {
    super();

    this.#initTelemetry();
    this.#initOptions();
  }

  #initTelemetry(): void {
    this.telemetry.push((args: CommandArgs) => {
      Object.assign(this.telemetryProperties, {
        displayName: typeof args.options.displayName !== 'undefined',
        mailNickname: typeof args.options.mailNickname !== 'undefined',
        includeSiteUrl: args.options.includeSiteUrl,
        withSiteUrl: !!args.options.withSiteUrl,
        orphaned: !!args.options.orphaned
      });
    });
  }

  #initOptions(): void {
    this.options.unshift(
      {
        option: '-d, --displayName [displayName]'
      },
      {
        option: '-m, --mailNickname [displayName]'
      },
      {
        option: '--includeSiteUrl'
      },
      {
        option: '--withSiteUrl'
      },
      {
        option: '--orphaned'
      }
    );
  }

  public defaultProperties(): string[] | undefined {
    return ['id', 'displayName', 'mailNickname', 'siteUrl'];
  }

  public async commandAction(logger: Logger, args: CommandArgs): Promise<void> {
    if (args.options.includeSiteUrl) {
      await this.warn(logger, `Parameter 'includeSiteUrl' is deprecated. Please use 'withSiteUrl' instead`);
    }

    const groupFilter: string = `?$filter=groupTypes/any(c:c+eq+'Unified')`;
    const displayNameFilter: string = args.options.displayName ? ` and startswith(DisplayName,'${formatting.encodeQueryParameter(args.options.displayName)}')` : '';
    const mailNicknameFilter: string = args.options.mailNickname ? ` and startswith(MailNickname,'${formatting.encodeQueryParameter(args.options.mailNickname)}')` : '';
    const expandOwners: string = args.options.orphaned ? '&$expand=owners' : '';
    const topCount: string = '&$top=100';

    try {
      let groups: GroupExtended[] = [];
      groups = await odata.getAllItems<GroupExtended>(`${this.resource}/v1.0/groups${groupFilter}${displayNameFilter}${mailNicknameFilter}${expandOwners}${topCount}`);

      if (args.options.orphaned) {
        const orphanedGroups: GroupExtended[] = [];

        groups.forEach((group) => {
          if (!group.owners || group.owners.length === 0) {
            orphanedGroups.push(group);
          }
        });

        groups = orphanedGroups;
      }

      if (args.options.includeSiteUrl || args.options.withSiteUrl) {
        const res = await Promise.all(groups.map(g => this.getGroupSiteUrl(g.id as string)));
        res.forEach(r => {
          for (let i: number = 0; i < groups.length; i++) {
            if (groups[i].id !== r.id) {
              continue;
            }

            groups[i].siteUrl = r.url;
            break;
          }
        });
      }

      await logger.log(groups);
    }
    catch (err: any) {
      this.handleRejectedODataJsonPromise(err);
    }
  }

  private async getGroupSiteUrl(groupId: string): Promise<{ id: string, url: string }> {
    const requestOptions: CliRequestOptions = {
      url: `${this.resource}/v1.0/groups/${groupId}/drive?$select=webUrl`,
      headers: {
        accept: 'application/json;odata.metadata=none'
      },
      responseType: 'json'
    };

    const res = await request.get<{ webUrl: string }>(requestOptions);
    return {
      id: groupId,
      url: res.webUrl ? res.webUrl.substring(0, res.webUrl.lastIndexOf('/')) : ''
    };
  }
}

export default new EntraM365GroupListCommand();