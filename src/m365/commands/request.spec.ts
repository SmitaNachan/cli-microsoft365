import assert from 'assert';
import fs from 'fs';
import sinon from 'sinon';
import { PassThrough } from 'stream';
import auth from '../../Auth.js';
import { cli } from '../../cli/cli.js';
import { CommandInfo } from '../../cli/CommandInfo.js';
import { Logger } from '../../cli/Logger.js';
import { CommandError } from '../../Command.js';
import request from '../../request.js';
import { telemetry } from '../../telemetry.js';
import { pid } from '../../utils/pid.js';
import { session } from '../../utils/session.js';
import { sinonUtil } from '../../utils/sinonUtil.js';
import commands from './commands.js';
import command from './request.js';

describe(commands.REQUEST, () => {
  let log: any[];
  let logger: Logger;
  let loggerLogSpy: sinon.SinonSpy;
  let loggerLogToStderrSpy: sinon.SinonSpy;
  let commandInfo: CommandInfo;

  //#region 
  const mockSPOWebJSONResponse = { "AllowRssFeeds": true, "AlternateCssUrl": "", "AppInstanceId": "00000000-0000-0000-0000-000000000000", "ClassicWelcomePage": null, "Configuration": 0, "Created": "2020-10-08T07:03:47.907", "CurrentChangeToken": { "StringValue": "1;2;d5f1681e-9480-4636-ac33-094bb75c44ff;637960770683600000;495812642" }, "CustomMasterUrl": "/_catalogs/masterpage/seattle.master", "Description": "", "DesignPackageId": "00000000-0000-0000-0000-000000000000", "DocumentLibraryCalloutOfficeWebAppPreviewersDisabled": false, "EnableMinimalDownload": false, "FooterEmphasis": 0, "FooterEnabled": true, "FooterLayout": 0, "HeaderEmphasis": 0, "HeaderLayout": 0, "HideTitleInHeader": false, "HorizontalQuickLaunch": false, "Id": "d5f1681e-9480-4636-ac33-094bb75c44ff", "IsEduClass": false, "IsEduClassProvisionChecked": false, "IsEduClassProvisionPending": false, "IsHomepageModernized": false, "IsMultilingual": true, "IsRevertHomepageLinkHidden": false, "Language": 1033, "LastItemModifiedDate": "2022-08-14T11:31:56Z", "LastItemUserModifiedDate": "2022-08-14T11:31:56Z", "LogoAlignment": 0, "MasterUrl": "/_catalogs/masterpage/seattle.master", "MegaMenuEnabled": true, "NavAudienceTargetingEnabled": false, "NoCrawl": false, "ObjectCacheEnabled": false, "OverwriteTranslationsOnChange": false, "ResourcePath": { "DecodedUrl": "https://contoso.sharepoint.com" }, "QuickLaunchEnabled": true, "RecycleBinEnabled": true, "SearchScope": 0, "ServerRelativeUrl": "/", "SiteLogoUrl": "/SiteAssets/__sitelogo__logo_240x240.png", "SyndicationEnabled": true, "TenantAdminMembersCanShare": 0, "Title": "Contoso Intranet", "TreeViewEnabled": false, "UIVersion": 15, "UIVersionConfigurationEnabled": false, "Url": "https://contoso.sharepoint.com", "WebTemplate": "SITEPAGEPUBLISHING", "WelcomePage": "SitePages/Home.aspx" };
  const mockSPOWebXMLResponse = '<?xml version="1.0" encoding="utf-8"?><entry xml:base="https://contoso.sharepoint.com/_api/" xmlns="http://www.w3.org/2005/Atom" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:georss="http://www.georss.org/georss" xmlns:gml="http://www.opengis.net/gml"><id>https://contoso.sharepoint.com/_api/Web</id><category term="SP.Web" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme" /><link rel="edit" href="Web" /><title /><updated>2022-08-14T21:57:35Z</updated><author><name /></author><content type="application/xml"><m:properties><d:Title>Contoso Intranet</d:Title></m:properties></content></entry>';
  const graphResponse = {
    '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users/$entity',
    businessPhones: [
      "1234567"
    ],
    displayName: 'John Doe',
    givenName: 'John',
    jobTitle: null,
    mail: 'john.doe@contoso.onmicrosoft.com',
    mobilePhone: null,
    officeLocation: null,
    preferredLanguage: 'en - US',
    surname: 'Doe',
    userPrincipalName: 'john.doe@contoso.onmicrosoft.com',
    id: '5935bd84-463f-4f09-b88a-3a3215b4894e'
  };
  //#endregion

  before(() => {
    sinon.stub(auth, 'restoreAuth').callsFake(() => Promise.resolve());
    sinon.stub(telemetry, 'trackEvent').resolves();
    sinon.stub(pid, 'getProcessName').callsFake(() => '');
    sinon.stub(session, 'getId').callsFake(() => '');
    auth.connection.active = true;
    sinon.stub(auth, 'ensureAccessToken').callsFake(() => Promise.resolve('ABC'));
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
    loggerLogSpy = sinon.spy(logger, 'log');
    loggerLogToStderrSpy = sinon.spy(logger, 'logToStderr');
  });

  afterEach(() => {
    sinonUtil.restore([
      request.execute,
      fs.createWriteStream
    ]);
  });

  after(() => {
    sinon.restore();
    auth.connection.accessTokens = {};
    auth.connection.active = false;
    auth.connection.spoUrl = undefined;
  });

  it('has correct name', () => {
    assert.strictEqual(command.name.startsWith(commands.REQUEST), true);
  });

  it('has a description', () => {
    assert.notStrictEqual(command.description, null);
  });

  it('fails validation if wrong method is set', async () => {
    const actual = await command.validate({
      options: {
        url: 'https://contoso.sharepoint.com/_api/web',
        method: 'gett'
      }
    }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('fails validation if body is set when content-type is not specified', async () => {
    const actual = await command.validate({
      options: {
        url: 'https://contoso.sharepoint.com/_api/web',
        body: '{ "key": "value" }',
        method: 'post'
      }
    }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('fails validation if body is set on GET requests', async () => {
    const actual = await command.validate({
      options: {
        url: 'https://contoso.sharepoint.com/_api/web',
        body: '{ "key": "value" }',
        'content-type': 'application/json',
        method: 'get'
      }
    }, commandInfo);
    assert.notStrictEqual(actual, true);
  });

  it('fails validation if filePath doesn\'t exist', async () => {
    sinon.stub(fs, 'existsSync').callsFake(() => false);
    const actual = await command.validate({
      options: {
        url: "https://contoso.sharepoint.com/_api/web/GetFileById('b2307a39-e878-458b-bc90-03bc578531d6')/$value",
        method: 'get',
        filePath: 'abc'
      }
    }, commandInfo);
    sinonUtil.restore(fs.existsSync);
    assert.notStrictEqual(actual, true);
  });

  it('passes validation with body and content-type on POST request', async () => {
    const actual = await command.validate({
      options: {
        url: 'https://contoso.sharepoint.com/_api/web',
        body: '{ "key": "value" }',
        'content-type': 'application/json',
        method: 'post'
      }
    }, commandInfo);
    assert.strictEqual(actual, true);
  });

  it('passes validation with correct method set', async () => {
    const actual = await command.validate({
      options: {
        url: 'https://contoso.sharepoint.com/_api/web',
        method: 'get'
      }
    }, commandInfo);
    assert.strictEqual(actual, true);
  });

  it('passes validation with no method set', async () => {
    const actual = await command.validate({
      options: {
        url: 'https://contoso.sharepoint.com/_api/web'
      }
    }, commandInfo);
    assert.strictEqual(actual, true);
  });

  it('correctly defaults to a GET request accepting a json response', async () => {
    sinon.stub(request, 'execute').callsFake((opts) => {
      if (opts.method === 'GET' && opts.headers!.accept === 'application/json') {
        return Promise.resolve(mockSPOWebJSONResponse);
      }

      return Promise.reject('Invalid request');
    });

    await command.action(logger, {
      options: {
        url: 'https://contoso.sharepoint.com/_api/web'
      }
    });
  });

  it('successfully executes a GET request to a SharePoint API endpoint', async () => {
    sinon.stub(request, 'execute').callsFake((opts) => {
      if (opts.url === 'https://contoso.sharepoint.com/_api/web') {
        return Promise.resolve(mockSPOWebJSONResponse);
      }

      return Promise.reject('Invalid request');
    });

    await command.action(logger, {
      options: {
        url: 'https://contoso.sharepoint.com/_api/web',
        accept: 'application/json;odata=nometadata'
      }
    });
    assert(loggerLogSpy.calledWith(mockSPOWebJSONResponse));
  });

  it('successfully executes a GET request to a SharePoint API endpoint accepting XML', async () => {
    sinon.stub(request, 'execute').callsFake((opts) => {
      if (opts.url === 'https://contoso.sharepoint.com/_api/web?$select=Title') {
        return Promise.resolve(mockSPOWebXMLResponse);
      }

      return Promise.reject('Invalid request');
    });

    await command.action(logger, {
      options: {
        url: 'https://contoso.sharepoint.com/_api/web?$select=Title',
        accept: 'application/xml'
      }
    });
    assert(loggerLogSpy.calledWith(mockSPOWebXMLResponse));
  });

  it('successfully executes a GET request to a SharePoint API endpoint (debug)', async () => {
    sinon.stub(request, 'execute').callsFake((opts) => {
      if (opts.url === 'https://contoso.sharepoint.com/_api/web') {
        return Promise.resolve(mockSPOWebJSONResponse);
      }

      return Promise.reject('Invalid request');
    });

    await command.action(logger, {
      options: {
        url: 'https://contoso.sharepoint.com/_api/web',
        accept: 'application/json;odata=nometadata',
        debug: true
      }
    });
    assert(loggerLogSpy.calledWith(mockSPOWebJSONResponse));
  });

  it('successfully executes a POST request to a SharePoint API endpoint', async () => {
    sinon.stub(request, 'execute').callsFake((opts) => {
      if (opts.url === 'https://contoso.sharepoint.com/_api/web') {
        return Promise.resolve(mockSPOWebJSONResponse);
      }

      return Promise.reject('Invalid request');
    });

    await command.action(logger, {
      options: {
        url: 'https://contoso.sharepoint.com/_api/web',
        accept: 'application/json;odata=nometadata',
        'content-type': 'application/json',
        'x-http-method': 'PATCH',
        method: 'post'
      }
    });
    assert(loggerLogSpy.calledWith(mockSPOWebJSONResponse));
  });

  it('successfully executes a request with a manually specified resource', async () => {
    sinon.stub(request, 'execute').callsFake((opts) => {
      if (opts.url === 'https://contoso.sharepoint.com/_api/web') {
        return Promise.resolve(mockSPOWebJSONResponse);
      }

      return Promise.reject('Invalid request');
    });

    await command.action(logger, {
      options: {
        url: 'https://contoso.sharepoint.com/_api/web',
        accept: 'application/json;odata=nometadata',
        resource: 'https://contoso.sharepoint.com'
      }
    });
    assert(loggerLogSpy.calledWith(mockSPOWebJSONResponse));
  });

  it('successfully executes a request with a manually specified resource (debug)', async () => {
    sinon.stub(request, 'execute').callsFake((opts) => {
      if (opts.url === 'https://contoso.sharepoint.com/_api/web') {
        return Promise.resolve(mockSPOWebJSONResponse);
      }

      return Promise.reject('Invalid request');
    });

    await command.action(logger, {
      options: {
        url: 'https://contoso.sharepoint.com/_api/web',
        accept: 'application/json;odata=nometadata',
        resource: 'https://contoso.sharepoint.com',
        debug: true
      }
    });
    assert(loggerLogToStderrSpy.called);
    assert(loggerLogSpy.calledWith(mockSPOWebJSONResponse));
  });

  it('successfully executes a GET request to a Graph API endpoint with the @graph token', async () => {
    sinon.stub(request, 'execute').callsFake(async (opts) => {
      if (opts.url === 'https://graph.microsoft.com/v1.0/me') {
        return graphResponse;
      }

      throw 'Invalid request';
    });

    await command.action(logger, {
      options: {
        url: '@graph/me',
        accept: 'application/json;odata.metadata=none'
      }
    });
    assert(loggerLogSpy.calledWith(graphResponse));
  });


  it('successfully executes a GET request to a Graph API endpoint with the @graphbeta token', async () => {
    sinon.stub(request, 'execute').callsFake(async (opts) => {
      if (opts.url === 'https://graph.microsoft.com/beta/me') {
        return graphResponse;
      }

      throw 'Invalid request';
    });

    await command.action(logger, {
      options: {
        url: '@graphbeta/me',
        accept: 'application/json;odata.metadata=none'
      }
    });
    assert(loggerLogSpy.calledWith(graphResponse));
  });

  it('successfully executes a GET request to a SharePoint API endpoint with the @spo token', async () => {
    auth.connection.spoUrl = 'https://contoso.sharepoint.com';
    sinon.stub(request, 'execute').callsFake(async (opts) => {
      if (opts.url === 'https://contoso.sharepoint.com/_api/web') {
        return mockSPOWebJSONResponse;
      }

      throw 'Invalid request';
    });

    await command.action(logger, {
      options: {
        url: '@spo/_api/web',
        accept: 'application/json;odata=nometadata'
      }
    });
    assert(loggerLogSpy.calledWith(mockSPOWebJSONResponse));
  });

  it('throws error when using the @spo token when there is nog spoUrl in the auth service', async () => {
    auth.connection.spoUrl = undefined;
    await assert.rejects(command.action(logger, {
      options: {
        url: '@spo/_api/web',
        accept: 'application/json;odata=nometadata'
      }
    }), new CommandError(`SharePoint root site URL is unknown. Please set your SharePoint URL using command 'spo set'.`));
  });

  it('correctly handles an API exception', async () => {
    sinon.stub(request, 'execute').callsFake(_ => {
      return Promise.reject('Invalid request');
    });

    await assert.rejects(command.action(logger, {
      options: {
        url: 'https://contoso.sharepoint.com/_api/web'
      }
    } as any), new CommandError('Invalid request'));
  });


  it('writeFile called when option --asFile is specified (verbose)', async () => {
    const mockResponse = `{"data": 123}`;
    const responseStream = new PassThrough();
    responseStream.write(mockResponse);
    responseStream.end(); //Mark that we pushed all the data.

    const writeStream = new PassThrough();
    const fsStub = sinon.stub(fs, 'createWriteStream').returns(writeStream as any);

    setTimeout(() => {
      writeStream.emit('close');
    }, 5);

    sinon.stub(request, 'execute').callsFake((opts) => {
      if ((opts.url as string).indexOf('/_api/web/GetFileById(') > -1) {
        return Promise.resolve({
          data: responseStream
        });
      }

      return Promise.reject('Invalid request');
    });

    const options = {
      verbose: true,
      url: "https://contoso.sharepoint.com/_api/web/GetFileById('b2307a39-e878-458b-bc90-03bc578531d6')/$value",
      body: '{ "key": "value" }',
      'content-type': 'application/json',
      method: 'get',
      filePath: 'test1.docx'
    };

    await command.action(logger, { options: options } as any);
    assert(fsStub.calledOnce);
    sinonUtil.restore([
      fs.createWriteStream
    ]);
  });

  it('fails when empty file is created file with --asFile is specified', async () => {
    const mockResponse = `{"data": 123}`;
    const responseStream = new PassThrough();
    responseStream.write(mockResponse);
    responseStream.end(); //Mark that we pushed all the data.

    const writeStream = new PassThrough();
    const fsStub = sinon.stub(fs, 'createWriteStream').returns(writeStream as any);

    setTimeout(() => {
      writeStream.emit('error', "Writestream throws error");
    }, 5);

    sinon.stub(request, 'execute').callsFake((opts) => {
      if ((opts.url as string).indexOf('/_api/web/GetFileById(') > -1) {
        return Promise.resolve({
          data: responseStream
        });
      }

      return Promise.reject('Invalid request');
    });

    const options = {
      url: "https://contoso.sharepoint.com/_api/web/GetFileById('b2307a39-e878-458b-bc90-03bc578531d6')/$value",
      body: '{ "key": "value" }',
      'content-type': 'application/json',
      method: 'get',
      filePath: 'test1.docx'
    };

    await assert.rejects(command.action(logger, { options: options } as any), new CommandError('Writestream throws error'));
    assert(fsStub.calledOnce);
    sinonUtil.restore([
      fs.createWriteStream
    ]);
  });
});
