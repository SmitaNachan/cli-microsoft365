import assert from 'assert';
import sinon from 'sinon';
import auth from '../../../../Auth.js';
import { CommandError } from '../../../../Command.js';
import { cli } from '../../../../cli/cli.js';
import { CommandInfo } from '../../../../cli/CommandInfo.js';
import { Logger } from '../../../../cli/Logger.js';
import request from '../../../../request.js';
import { telemetry } from '../../../../telemetry.js';
import { odata } from '../../../../utils/odata.js';
import { pid } from '../../../../utils/pid.js';
import { session } from '../../../../utils/session.js';
import { sinonUtil } from '../../../../utils/sinonUtil.js';
import commands from '../../commands.js';
import command from './chat-member-remove.js';

describe(commands.CHAT_MEMBER_REMOVE, () => {
  const chatId = '19:09fd7575940146d383a4a83fc9598546@thread.v2';
  const userPrincipalName = 'john@contoso.com';
  const userId = 'a857e888-b602-4790-86d9-3dca2109449e';
  const chatMemberId = 'MCMjMCMjZTFkZDQwMjMtYTY1Ni00ODBhLThhMGUtYzFiMWVlYzUxZTFkIyMxOTowOWZkNzU3NTk0MDE0NmQzODNhNGE4M2ZjOTU5ODU0NkB0aHJlYWQudjIjI2E4NTdlODg4LWI2MDItNDc5MC04NmQ5LTNkY2EyMTA5NDQ5ZQ=="';
  const chatMembers = [
    {
      id: chatMemberId,
      roles: ['owner'],
      displayName: 'John Doe',
      visibleHistoryStartDateTime: '2022-04-08T09:15:53.423Z',
      userId: userId,
      email: userPrincipalName,
      tenantId: 'e1dd4023-a656-480a-8a0e-c1b1eec51e1d'
    },
    {
      id: 'MCMjMCMjZTFkZDQwMjMtYTY1Ni00ODBhLThhMGUtYzFiMWVlYzUxZTFkIyMxOTowOWZkNzU3NTk0MDE0NmQzODNhNGE4M2ZjOTU5ODU0NkB0aHJlYWQudjIjI2ZlMzZmNzVlLWMxMDMtNDEwYi1hMThhLTJiZjZkZjA2YWMzYQ==',
      roles: ['owner'],
      displayName: 'Adele Vance',
      visibleHistoryStartDateTime: '2022-04-08T09:15:53.423Z',
      userId: 'fe36f75e-c103-410b-a18a-2bf6df06ac3a',
      email: 'adele@contoso.com',
      tenantId: 'e1dd4023-a656-480a-8a0e-c1b1eec51e1d'
    }
  ];

  let log: string[];
  let logger: Logger;
  let commandInfo: CommandInfo;
  let promptIssued: boolean = false;

  before(() => {
    sinon.stub(auth, 'restoreAuth').resolves();
    sinon.stub(telemetry, 'trackEvent').resolves();
    sinon.stub(pid, 'getProcessName').returns('');
    sinon.stub(session, 'getId').returns('');
    auth.connection.active = true;
    commandInfo = cli.getCommandInfo(command);
  });

  beforeEach(() => {
    log = [];
    logger = {
      log: async (msg: string) => {
        log.push(msg);
      },
      logRaw: async (msg: string) => {
        log.push(msg);
      },
      logToStderr: async (msg: string) => {
        log.push(msg);
      }
    };
    sinon.stub(cli, 'promptForConfirmation').callsFake(() => {
      promptIssued = true;
      return Promise.resolve(false);
    });

    promptIssued = false;
  });

  afterEach(() => {
    sinonUtil.restore([
      odata.getAllItems,
      request.delete,
      cli.promptForConfirmation
    ]);
  });

  after(() => {
    sinon.restore();
    auth.connection.active = false;
  });

  it('has correct name', () => {
    assert.strictEqual(command.name, commands.CHAT_MEMBER_REMOVE);
  });

  it('has a description', () => {
    assert.notStrictEqual(command.description, null);
  });

  it('removes the member by specifying the userId', async () => {
    sinon.stub(odata, 'getAllItems').callsFake(async url => {
      if (url === `https://graph.microsoft.com/v1.0/chats/${chatId}/members`) {
        return chatMembers;
      }

      throw 'Invalid request';
    });
    const deleteStub = sinon.stub(request, 'delete').callsFake(async (opts) => {
      if (opts.url === `https://graph.microsoft.com/v1.0/chats/${chatId}/members/${chatMemberId}`) {
        return;
      }

      throw 'Invalid request';
    });

    await command.action(logger, { options: { chatId: chatId, userId: userId, force: true, verbose: true } });
    assert(deleteStub.called);
  });

  it('removes the member from a chat by specifying the member id', async () => {
    const deleteStub = sinon.stub(request, 'delete').callsFake(async (opts) => {
      if (opts.url === `https://graph.microsoft.com/v1.0/chats/${chatId}/members/${chatMemberId}`) {
        return;
      }

      throw 'Invalid request';
    });

    await command.action(logger, { options: { chatId: chatId, id: chatMemberId, force: true, verbose: true } });
    assert(deleteStub.called);
  });


  it('removes the specified member retrieved by user principal name when prompt confirmed', async () => {
    sinon.stub(odata, 'getAllItems').callsFake(async url => {
      if (url === `https://graph.microsoft.com/v1.0/chats/${chatId}/members`) {
        return chatMembers;
      }

      throw 'Invalid request';
    });
    const deleteStub = sinon.stub(request, 'delete').callsFake(async (opts) => {
      if (opts.url === `https://graph.microsoft.com/v1.0/chats/${chatId}/members/${chatMemberId}`) {
        return;
      }

      throw 'Invalid request';
    });

    sinonUtil.restore(cli.promptForConfirmation);
    sinon.stub(cli, 'promptForConfirmation').resolves(true);

    await command.action(logger, { options: { chatId: chatId, userName: userPrincipalName, verbose: true } });
    assert(deleteStub.called);
  });

  it('throws error when member by specifying userName is not found in the chat', async () => {
    sinon.stub(odata, 'getAllItems').callsFake(async url => {
      if (url === `https://graph.microsoft.com/v1.0/chats/${chatId}/members`) {
        return [...chatMembers.slice(1)];
      }

      throw 'Invalid request';
    });

    await assert.rejects(command.action(logger, { options: { chatId: chatId, userName: userPrincipalName, force: true, verbose: true } }),
      new CommandError(`Member with userName '${userPrincipalName}' could not be found in the chat.`));
  });

  it('throws error when member by specifying userId is not found in the chat', async () => {
    sinon.stub(odata, 'getAllItems').callsFake(async url => {
      if (url === `https://graph.microsoft.com/v1.0/chats/${chatId}/members`) {
        return [...chatMembers.slice(1)];
      }

      throw 'Invalid request';
    });

    await assert.rejects(command.action(logger, { options: { chatId: chatId, userId: userId, force: true, verbose: true } }),
      new CommandError(`Member with userId '${userId}' could not be found in the chat.`));
  });

  it('prompts before removing the specified message when force option not passed', async () => {
    await command.action(logger, { options: { chatId: chatId, id: chatMemberId } });


    assert(promptIssued);
  });

  it('aborts removing the specified chat member when force option not passed and prompt not confirmed', async () => {
    const deleteStub = sinon.stub(request, 'delete').resolves();

    await command.action(logger, { options: { chatId: chatId, userId: userId } });
    assert(deleteStub.notCalled);
  });

  it('fails validation if the chatId is not valid chatId', async () => {
    const actual = await command.validate({ options: { chatId: 'invalid', userId: userId } }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('fails validation if the userId is not valid guid', async () => {
    const actual = await command.validate({ options: { chatId: chatId, userId: 'invalid' } }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('fails validation if the userName is not valid UPN', async () => {
    const actual = await command.validate({ options: { chatId: chatId, userName: 'invalid' } }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('passes validation if ID of a chat member is passed', async () => {
    const actual = await command.validate({ options: { chatId: chatId, id: chatMemberId } }, commandInfo);
    assert.strictEqual(actual, true);
  });

  it('passes validation if the userId is a valid GUID', async () => {
    const actual = await command.validate({ options: { chatId: chatId, userId: userId } }, commandInfo);
    assert.strictEqual(actual, true);
  });

  it('passes validation if the userName is a valid UPN', async () => {
    const actual = await command.validate({ options: { chatId: chatId, userName: userPrincipalName } }, commandInfo);
    assert.strictEqual(actual, true);
  });
});
