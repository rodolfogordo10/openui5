/*!
 * ${copyright}
 */
sap.ui.require([
	"jquery.sap.global",
	"sap/m/ColumnListItem",
	"sap/m/Text",
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/odata/OperationMode",
	"sap/ui/model/odata/v4/ODataModel",
	"sap/ui/model/Sorter",
	"sap/ui/test/TestUtils",
	// load Table resources upfront to avoid loading times > 1 second for the first test using Table
	"sap/ui/table/Table"
], function (jQuery, ColumnListItem, Text, Controller, Filter, FilterOperator, OperationMode,
		ODataModel, Sorter, TestUtils) {
	/*global QUnit, sinon */
	/*eslint max-nested-callbacks: 0, no-warning-comments: 0 */
	"use strict";

	var sDefaultLanguage = sap.ui.getCore().getConfiguration().getLanguage(),
		sTeaBusi = "/sap/opu/odata4/IWBEP/TEA/default/IWBEP/TEA_BUSI/0001/";

	/**
	 * Creates a V4 OData model.
	 *
	 * @param {string} sServiceUrl The service URL
	 * @param {object} [mModelParameters] Map of parameters for model construction to enhance and
	 *   potentially overwrite the parameters groupId, operationMode, serviceUrl,
	 *   synchronizationMode which are set by default
	 * @returns {sap.ui.model.odata.v4.ODataModel} The model
	 */
	function createModel(sServiceUrl, mModelParameters) {
		var mDefaultParameters = {
				groupId : "$direct",
				operationMode : OperationMode.Server,
				serviceUrl : sServiceUrl,
				synchronizationMode : "None"
			};

		return new ODataModel(jQuery.extend(mDefaultParameters, mModelParameters));
	}

	/**
	 * Creates a V4 OData model for <code>TEA_BUSI</code>.
	 *
	 * @param {object} [mModelParameters] Map of parameters for model construction to enhance and
	 *   potentially overwrite the parameters groupId, operationMode, serviceUrl,
	 *   synchronizationMode which are set by default
	 * @returns {sap.ui.model.odata.v4.ODataModel} The model
	 */
	function createTeaBusiModel(mModelParameters) {
		return createModel(sTeaBusi, mModelParameters);
	}

	/**
	 * Creates a V4 OData model for <code>GWSAMPLE_BASIC</code>.
	 *
	 * @param {object} [mModelParameters] Map of parameters for model construction to enhance and
	 *   potentially overwrite the parameters groupId, operationMode, serviceUrl,
	 *   synchronizationMode which are set by default
	 * @returns {ODataModel} The model
	 */
	function createSalesOrdersModel(mModelParameters) {
		return createModel(
			"/sap/opu/odata4/sap/zui5_testv4/default/sap/zui5_epm_sample/0002/",
			mModelParameters);
	}

	/**
	 * Creates a V4 OData model for special cases (not backed by Gateway).
	 *
	 * @param {object} [mModelParameters] Map of parameters for model construction to enhance and
	 *   potentially overwrite the parameters groupId, operationMode, serviceUrl,
	 *   synchronizationMode which are set by default
	 * @returns {ODataModel} The model
	 */
	function createSpecialCasesModel(mModelParameters) {
		return createModel("/special/cases/", mModelParameters);
	}

	/**
	 *  Create a view with a relative ODataListBinding which is ready to create a new entity.
	 *
	 * @param {object} oTest The QUnit test object
	 * @param {object} assert The QUnit assert object
	 * @returns {Promise} A Promise that is resolved when the view is created and ready to create
	 *   a relative entity
	 */
	function prepareTestForCreateOnRelativeBinding(oTest, assert) {
		var oModel = createTeaBusiModel({updateGroupId : "update"}),
			sView = '\
<FlexBox id="form" binding="{path : \'/TEAMS(\\\'42\\\')\',\
	parameters : {$expand : {TEAM_2_EMPLOYEES : {$select : \'ID,Name\'}}}}">\
	<Table id="table" items="{TEAM_2_EMPLOYEES}">\
		<ColumnListItem>\
			<Text id="id" text="{ID}" />\
			<Text id="text" text="{Name}" />\
		</ColumnListItem>\
	</Table>\
</FlexBox>';

		oTest.expectRequest("TEAMS('42')?$expand=TEAM_2_EMPLOYEES($select=ID,Name)", {
				"TEAM_2_EMPLOYEES" : [
					{"ID" : "2", "Name" : "Frederic Fall"}
				]
			})
			.expectChange("id", ["2"])
			.expectChange("text", ["Frederic Fall"]);

		return oTest.createView(assert, sView, oModel);
	}

	//*********************************************************************************************
	QUnit.module("sap.ui.model.odata.v4.ODataModel.integration", {
		beforeEach : function () {
			// We use a formatter to check for property changes. However before the formatter is
			// called, the value is passed through the type's formatValue
			// (see PropertyBinding#_toExternalValue). Ensure that this result is predictable.
			sap.ui.getCore().getConfiguration().setLanguage("en-US");

			this.oSandbox = sinon.sandbox.create();
			// These metadata files are _always_ faked, the query option "realOData" is ignored
			TestUtils.useFakeServer(this.oSandbox, "/sap/ui/core/qunit", {
				"/sap/opu/odata/IWBEP/GWSAMPLE_BASIC/$metadata"
					: {source : "model/GWSAMPLE_BASIC.metadata.xml"},
				"/sap/opu/odata/IWBEP/GWSAMPLE_BASIC/annotations.xml"
					: {source : "model/GWSAMPLE_BASIC.annotations.xml"},
				"/sap/opu/odata4/IWBEP/TEA/default/IWBEP/TEA_BUSI/0001/$metadata"
					: {source : "odata/v4/data/metadata.xml"},
				"/sap/opu/odata4/IWBEP/TEA/default/iwbep/tea_busi_product/0001/$metadata"
					: {source : "odata/v4/data/metadata_tea_busi_product.xml"},
				"/sap/opu/odata4/sap/zui5_testv4/default/sap/zui5_epm_sample/0002/$metadata"
					: {source : "odata/v4/data/metadata_zui5_epm_sample.xml"},
				"/special/cases/$metadata"
					: {source : "odata/v4/data/metadata_special_cases.xml"}
			});
			this.oLogMock = this.oSandbox.mock(jQuery.sap.log);
			this.oLogMock.expects("warning").never();
			this.oLogMock.expects("error").never();

			// {map<string, object[]>}
			// this.mBatchQueue["sGroupId"] is a list of queued requests for the group "sGroupId"
			this.mBatchQueue = {};
			// {map<string, string[]>}
			// this.mChanges["id"] is a list of expected changes for the property "text" of the
			// control with ID "id"
			this.mChanges = {};
			// {map<string, string[][]>}
			// this.mListChanges["id"][i] is a list of expected changes for the property "text" of
			// the control with ID "id" in row i
			this.mListChanges = {};
			// A list of expected requests with the properties method, url, headers, response
			this.aRequests = [];
		},

		afterEach : function () {
			this.oSandbox.verifyAndRestore();
			// avoid calls to formatters by UI5 localization changes in later tests
			this.oView.destroy();
			this.oModel.destroy();
			// reset the language
			sap.ui.getCore().getConfiguration().setLanguage(sDefaultLanguage);
		},

		/**
		 * Finishes the test if no pending changes are left and all expected requests have been
		 * received.
		 */
		checkFinish : function () {
			var sControlId, i;

			if (this.aRequests.length) {
				return;
			}
			for (sControlId in this.mChanges) {
				if (this.mChanges[sControlId].length) {
					return;
				}
			}
			for (sControlId in this.mListChanges) {
				// Note: This may be a sparse array
				for (i in this.mListChanges[sControlId]) {
					if (this.mListChanges[sControlId][i].length) {
						return;
					}
				}
			}
			if (this.resolve) {
				this.resolve();
			}
		},

		/**
		 * Creates a view with a numeric property, "enters" incorrect text to reach an invalid data
		 * state, calls resetChanges at the given object and checks that the control gets another
		 * change event.
		 *
		 * @param {object} assert The QUnit assert object
		 * @param {function} fnGetResetable The function to determine the object to call
		 *   resetChanges at. The function gets the view as parameter.
		 * @returns {Promise} A Promise that is resolved when the change event has been fired
		 */
		checkResetInvalidDataState : function (assert, fnGetResetable) {
			var oModel = createTeaBusiModel({updateGroupId : "update"}),
				sView = '\
<FlexBox id="form" binding="{/EMPLOYEES(\'2\')}">\
	<Text id="age" text="{AGE}" />\
</FlexBox>',
				that = this;

			this.expectRequest("EMPLOYEES('2')", {"AGE" : 32})
				.expectChange("age", "32");

			return this.createView(assert, sView, oModel).then(function () {
				var oBinding = that.oView.byId("age").getBinding("text"),
					fnFormatter = oBinding.fnFormatter;

				delete oBinding.fnFormatter;
				assert.throws(function () {
					oBinding.setExternalValue("bad");
				});
				assert.ok(oBinding.getDataState().isControlDirty());

				oBinding.fnFormatter = fnFormatter;

				that.expectChange("age", "32");

				// code under test
				// Note: $direct would be an "Invalid group ID" here
				fnGetResetable(that.oView).resetChanges();

				return that.waitForChanges(assert);
			});
		},

		/**
		 * Checks that the given value is the expected one for the control.
		 *
		 * @param {object} assert The QUnit assert object
		 * @param {string} sValue The value
		 * @param {string} sControlId The control ID
		 * @param {number|string} [vRow] The row index in case the control's binding is below a
		 *   list binding or the path of the row's context (for example in the tests of the
		 *   ODataMetaModel), otherwise <code>undefined</code>.
		 */
		checkValue : function (assert, sValue, sControlId, vRow) {
			var aExpectedValues = vRow === undefined
					? this.mChanges[sControlId]
					: this.mListChanges[sControlId][vRow],
				sVisibleId = vRow === undefined ? sControlId : sControlId + "[" + vRow + "]";

			if (!aExpectedValues || !aExpectedValues.length) {
				assert.ok(false, sVisibleId + ": " + JSON.stringify(sValue) + " (unexpected)");
			} else {
				assert.strictEqual(sValue, aExpectedValues.shift(),
					sVisibleId + ": " + JSON.stringify(sValue));
			}
			this.checkFinish();
		},

		/**
		 * Creates a V4 OData model for V2 service <code>GWSAMPLE_BASIC</code>.
		 *
		 * @param {object} mModelParameters Map of parameters for model construction to enhance and
		 *   potentially overwrite the parameters groupId, operationMode, serviceUrl,
		 *   synchronizationMode which are set by default
		 * @returns {ODataModel} The model
		 */
		createModelForV2SalesOrderService : function (mModelParameters) {
			var oLogMock = this.oLogMock;

			// The following warnings are logged when the GWSAMPLE_BASIC metamodel is loaded
			["Confirm", "Cancel", "InvoiceCreated", "GoodsIssueCreated"].forEach(function (sName) {
				oLogMock.expects("warning")
					.withExactArgs("Unsupported 'sap:action-for' at FunctionImport 'SalesOrder_"
						+ sName + "', removing this FunctionImport", undefined,
						"sap.ui.model.odata.v4.lib._V2MetadataConverter");
			});
			["filterable", "sortable"].forEach(function (sAnnotation) {
				oLogMock.expects("warning")
					.withExactArgs("Unsupported SAP annotation at a complex type in"
						+ " '/sap/opu/odata/IWBEP/GWSAMPLE_BASIC/$metadata'",
						"sap:" + sAnnotation + " at property 'GWSAMPLE_BASIC.CT_String/String'",
						"sap.ui.model.odata.v4.lib._V2MetadataConverter");
			});

			mModelParameters = jQuery.extend({}, {odataVersion : "2.0"}, mModelParameters);
			return createModel("/sap/opu/odata/IWBEP/GWSAMPLE_BASIC/", mModelParameters);
		},

		/**
		 * Creates the view and attaches it to the model. Checks that the expected requests (see
		 * {@link #expectRequest} are fired and the controls got the expected changes (see
		 * {@link #expectChange}).
		 *
		 * @param {object} assert The QUnit assert object
		 * @param {string} sViewXML The view content as XML
		 * @param {sap.ui.model.odata.v4.ODataModel} [oModel] The model; it is attached to the view
		 *   and to the test instance.
		 *   If no model is given, the <code>TEA_BUSI</code> model is created and used.
		 * @param {object} [oController]
		 *   An object defining the methods and properties of the controller
		 * @returns {Promise} A promise that is resolved when the view is created and all expected
		 *   values for controls have been set
		 */
		createView : function (assert, sViewXML, oModel, oController) {
			var sName,
				mRequestorStubs = {
					cancelChangesByFilter : cancelChangesByFilter,
					hasPendingChanges : function () {
						assert.ok(false, "hasPendingChanges");
					},
					relocate : function () {
						assert.ok(false, "relocate");
					},
					request : checkRequest,
					submitBatch : submitBatch
				},
				that = this;

			/*
			 * Stub function for _Requestor#cancelChangesByFilter. Can only handle the case that
			 * there is no candidate request to potentially cancel at all.
			 */
			function cancelChangesByFilter(fnFilter, sGroupId) {
				if (sGroupId) {
					assert.notOk(sGroupId in that.mBatchQueue);
				} else {
					assert.strictEqual(Object.keys(that.mBatchQueue).length, 0);
				}
			}

			/*
			 * Stub function for _Requestor#request. Checks that the expected request arrived and
			 * returns a promise for its response.
			 */
			function checkRequest(sMethod, sUrl, sGroupId, mHeaders, oPayload) {
				var oActualRequest = {
						groupId : sGroupId,
						method : sMethod,
						url : sUrl,
						headers : mHeaders,
						payload : oPayload
					},
					oExpectedRequest = that.aRequests.shift(),
					aRequests,
					oResponse;

				if (!oExpectedRequest) {
					assert.ok(false, sMethod + " " + sUrl + " for group " + sGroupId
						+ " (unexpected)");
				} else {
					oResponse = oExpectedRequest.response;
					delete oExpectedRequest.response;
					assert.deepEqual(oActualRequest, oExpectedRequest, sMethod + " " + sUrl);
				}

				if (!that.oModel.isDirectGroup(sGroupId)) { // "$batch" support
					aRequests = that.mBatchQueue[sGroupId];
					if (!aRequests) {
						aRequests = that.mBatchQueue[sGroupId] = [];
					}
					aRequests.push(oActualRequest);
					return new Promise(function (resolve) {
						oActualRequest.$resolve = resolve.bind(null, oResponse);
					});
				}
				return Promise.resolve(oResponse);
			}

			/*
			 * Stub function for _Requestor#submitBatch. Makes each request return its response.
			 */
			function submitBatch(sGroupId) {
				var aRequests = that.mBatchQueue[sGroupId];

				if (aRequests) {
					delete that.mBatchQueue[sGroupId];
					aRequests.forEach(function (oRequest) {
						oRequest.$resolve();
					});
				} else {
					assert.ok(false, "Nothing to submit for group ID: " + sGroupId);
				}

				return Promise.resolve(); // needed for .catch() in ODataModel
			}

			this.oModel = oModel || createTeaBusiModel();
			if (this.oModel.submitBatch) {
				//TODO basically, we should rather stub the requestor's jQuery.ajax() call only
				for (sName in mRequestorStubs) {
					sinon.stub(this.oModel.oRequestor, sName, mRequestorStubs[sName]);
				}
				this.oModel.oRequestor.restore = function () {
					for (sName in mRequestorStubs) {
						this[sName].restore();
					}
					delete this.restore;
				}.bind(this.oModel.oRequestor);
			} // else: it's a meta model
			//assert.ok(true, sViewXML); // uncomment to see XML in output, in case of parse issues
			this.oView = sap.ui.xmlview({
				controller : oController
					&& new (Controller.extend(jQuery.sap.uid(), oController))(),
				viewContent :
					'<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc" xmlns:t="sap.ui.table">'
						+ sViewXML
						+ '</mvc:View>'
			});
			Object.keys(this.mChanges).forEach(function (sControlId) {
				var oControl = that.oView.byId(sControlId);

				if (oControl) {
					that.setFormatter(assert, oControl, sControlId);
				}
			});
			Object.keys(this.mListChanges).forEach(function (sControlId) {
				var oControl = that.oView.byId(sControlId);

				if (oControl) {
					that.setFormatterInList(assert, oControl, sControlId);
				}
			});

			this.oView.setModel(that.oModel);
			return this.waitForChanges(assert);
		},

		/**
		 * The following code (either {@link #createView} or anything before
		 * {@link #waitForChanges}) is expected to set a value (or multiple values) at the property
		 * "text" of the control with the given ID. <code>vValue</code> must be a list with expected
		 * values for each row if the control is created via a template in a list.
		 *
		 * You must call the function before {@link #createView}, even if you do not expect a change
		 * to the control's value initially. This is necessary because createView must attach a
		 * formatter function to the binding info before the bindings are created in order to see
		 * the change. If you do not expect a value initially, leave out the vValue parameter.
		 *
		 * Examples:
		 * this.expectChange("foo", "bar"); // expect value "bar" for the control with id "foo"
		 * this.expectChange("foo"); // listen to changes for the control with id "foo", but do not
		 *                           // expect a change (in createView)
		 * this.expectChange("foo", false); // listen to changes for the control with id "foo", but
		 *                                 // do not expect a change (in createView). To be used if
		 *                                 // the control is a template within a table.
		 * this.expectChange("foo", ["a", "b"]); // expect values for two rows of the control with
		 *                                       // id "foo"
		 * this.expectChange("foo", "c", 2); // expect value "c" for control with id "foo" in row 2
		 * this.expectChange("foo", "d", "/MyEntitySet/ID");
		 *                                 // expect value "d" for control with id "foo" in a
		 *                                 // metamodel table on "/MyEntitySet/ID"
		 * this.expectChange("foo", "bar").expectChange("foo", "baz"); // expect 2 changes for "foo"
		 *
		 * @param {string} sControlId The control ID
		 * @param {string|string[]|boolean} [vValue] The expected value, a list of expected values
		 *   or <code>false</code> to enforce listening to a template control.
		 * @param {number|string} [vRow] The row index (for the model) or the path of its parent
		 *   context (for the metamodel), in case that a change is expected for a single row of a
		 *   list (in this case <code>vValue</code> must be a string).
		 * @returns {object} The test instance for chaining
		 */
		expectChange : function (sControlId, vValue, vRow) {
			var aExpectations, i;

			// Ensures that oObject[vProperty] is an array and returns it
			function array(oObject, vProperty) {
				oObject[vProperty] = oObject[vProperty] || [];
				return oObject[vProperty];
			}

			if (Array.isArray(vValue)) {
				aExpectations = array(this.mListChanges, sControlId);
				for (i = 0; i < vValue.length; i += 1) {
					array(aExpectations, i).push(vValue[i]);
				}
			} else if (arguments.length === 3) {
				// This may create a sparse array this.mListChanges[sControlId]
				array(array(this.mListChanges, sControlId), vRow).push(vValue);
			} else if (vValue === false) {
				array(this.mListChanges, sControlId);
			} else {
				aExpectations = array(this.mChanges, sControlId);
				if (arguments.length > 1) {
					aExpectations.push(vValue);
				}
			}
			return this;
		},

		/**
		 * The following code (either {@link #createView} or anything before
		 * {@link #waitForChanges}) is expected to perform the given request.
		 *
		 * @param {string|object} vRequest The request with the properties "method", "url" and
		 *   "headers". A string is interpreted as URL with method "GET".
		 * @param {object} [oResponse] The response message to be returned from the requestor.
		 * @returns {object} The test instance for chaining
		 */
		expectRequest : function (vRequest, oResponse) {
			if (typeof vRequest === "string") {
				vRequest = {
					method : "GET",
					url : vRequest
				};
			}
			// ensure that these properties are defined (required for deepEqual)
			vRequest.groupId = vRequest.groupId || "$direct";
			if (!("headers" in vRequest)) { // to allow null for vRequest.headers
				vRequest.headers = undefined;
			}
			vRequest.payload = vRequest.payload || undefined;
			vRequest.response = oResponse;
			this.aRequests.push(vRequest);
			return this;
		},

		/**
		 * Sets the formatter function which calls {@link #checkValue} for the given control.
		 * Note that you may only use controls that have a 'text' property.
		 *
		 * @param {object} assert The QUnit assert object
		 * @param {sap.ui.base.ManagedObject} oControl The control
		 * @param {string} sControlId The (symbolic) control ID for which changes are expected
		 */
		setFormatter : function (assert, oControl, sControlId) {
			var that = this;

			oControl.getBindingInfo("text").formatter = function (sValue) {
				that.checkValue(assert, sValue, sControlId);
			};
		},

		/**
		 * Sets the formatter function which calls {@link #checkValue} for the given control within
		 * a list item.
		 * Note that you may only use controls that have a 'text' property.
		 *
		 * @param {object} assert The QUnit assert object
		 * @param {object} oControl The control
		 * @param {string} sControlId The control ID for which changes are expected
		 */
		setFormatterInList : function (assert, oControl, sControlId) {
			var that = this;

			oControl.getBindingInfo("text").formatter = function (sValue) {
				that.checkValue(assert, sValue, sControlId,
					this.getBindingContext()
					&& (this.getBindingContext().getIndex
						? this.getBindingContext().getIndex()
						: this.getBindingContext().getPath()));
			};
		},

		/**
		 * Waits for the expected changes.
		 *
		 * @param {object} assert The QUnit assert object
		 * @returns {Promise} A promise that is resolved when all expected values for controls have
		 *   been set
		 */
		waitForChanges : function (assert) {
			var that = this;

			return new Promise(function (resolve) {
				that.resolve = resolve;
				// After three seconds everything should have run through
				// Resolve to have the missing requests and changes reported
				window.setTimeout(resolve, 3000);
				that.checkFinish();
			}).then(function () {
				var sControlId, i, j;

				// Report missing requests
				that.aRequests.forEach(function (oRequest) {
					assert.ok(false, oRequest.method + " " + oRequest.url + " (not requested)");
				});
				// Report missing changes
				for (sControlId in that.mChanges) {
					for (i in that.mChanges[sControlId]) {
						assert.ok(false, sControlId + ": " + that.mChanges[sControlId][i]
							+ " (not set)");
					}
				}
				for (sControlId in that.mListChanges) {
					// Note: This may be a sparse array
					for (i in that.mListChanges[sControlId]) {
						for (j in that.mListChanges[sControlId][i]) {
							assert.ok(false, sControlId + "[" + i + "]: "
								+ that.mListChanges[sControlId][i][j] + " (not set)");
						}
					}
				}
			});
		}
	});

	/*
	 * Creates a test with the given title and executes viewStart with the given parameters.
	 */
	function testViewStart(sTitle, sView, mResponseByRequest, mValueByControl, oModel) {

		QUnit.test(sTitle, function (assert) {
			var sControlId, sRequest;

			for (sRequest in mResponseByRequest) {
				this.expectRequest(sRequest, mResponseByRequest[sRequest]);
			}
			for (sControlId in mValueByControl) {
				this.expectChange(sControlId, mValueByControl[sControlId]);
			}
			return this.createView(assert, sView, oModel);
		});
	}

	//*********************************************************************************************
	// Scenario: Minimal test for an absolute ODataPropertyBinding. This scenario is comparable with
	// "FavoriteProduct" in the SalesOrders application.
	testViewStart("Absolute ODPB",
		'<Text id="text" text="{/EMPLOYEES(\'2\')/Name}" />',
		{"EMPLOYEES('2')/Name" : {"value" : "Frederic Fall"}},
		{"text" : "Frederic Fall"}
	);

	//*********************************************************************************************
	// Scenario: Minimal test for an absolute ODataContextBinding without own parameters containing
	// a relative ODataPropertyBinding. The SalesOrders application does not have such a scenario.
	testViewStart("Absolute ODCB w/o parameters with relative ODPB", '\
<FlexBox binding="{/EMPLOYEES(\'2\')}">\
	<Text id="text" text="{Name}" />\
</FlexBox>',
		{"EMPLOYEES('2')" : {"Name" : "Frederic Fall"}},
		{"text" : "Frederic Fall"}
	);

	//*********************************************************************************************
	// Scenario: Minimal test for an absolute ODataContextBinding with own parameters containing
	// a relative ODataPropertyBinding. The SalesOrders application does not have such a scenario.
	testViewStart("Absolute ODCB with parameters and relative ODPB", '\
<FlexBox binding="{path : \'/EMPLOYEES(\\\'2\\\')\', parameters : {$select : \'Name\'}}">\
	<Text id="text" text="{Name}" />\
</FlexBox>',
		{"EMPLOYEES('2')?$select=Name" : {"Name" : "Frederic Fall"}},
		{"text" : "Frederic Fall"}
	);

	//*********************************************************************************************
	// Scenario: Minimal test for an absolute ODataListBinding without own parameters containing
	// a relative ODataPropertyBinding. This scenario is comparable with the suggestion list for
	// the "Buyer ID" while creating a new sales order in the SalesOrders application.
	// * Start the application and click on "Create sales order" button.
	// * Open the suggestion list for the "Buyer ID"
	testViewStart("Absolute ODLB w/o parameters and relative ODPB", '\
<Table items="{/EMPLOYEES}">\
	<ColumnListItem>\
		<Text id="text" text="{Name}" />\
	</ColumnListItem>\
</Table>',
		{"EMPLOYEES?$skip=0&$top=100" :
			{"value" : [{"Name" : "Frederic Fall"}, {"Name" : "Jonathan Smith"}]}},
		{"text" : ["Frederic Fall", "Jonathan Smith"]}
	);

	//*********************************************************************************************
	// Scenario: Minimal test for an absolute ODataListBinding with own parameters containing
	// a relative ODataPropertyBinding. This scenario is comparable with the "Sales Orders" list in
	// the SalesOrders application.
	testViewStart("Absolute ODLB with parameters and relative ODPB", '\
<Table items="{path : \'/EMPLOYEES\', parameters : {$select : \'Name\'}}">\
	<ColumnListItem>\
		<Text id="text" text="{Name}" />\
	</ColumnListItem>\
</Table>',
		{"EMPLOYEES?$select=Name&$skip=0&$top=100" :
			{"value" : [{"Name" : "Frederic Fall"}, {"Name" : "Jonathan Smith"}]}},
		{"text" : ["Frederic Fall", "Jonathan Smith"]}
	);

	//*********************************************************************************************
	// Scenario: Static and dynamic filters and sorters at absolute ODataListBindings influence
	// the query. This scenario is comparable with the "Sales Orders" list in the SalesOrders
	// application.
	// * Static filters ($filter system query option) are and-combined with dynamic filters (filter
	//   parameter)
	// * Static sorters ($orderby system query option) are appended to dynamic sorters (sorter
	//   parameter)
	testViewStart("Absolute ODLB with Filters and Sorters with relative ODPB", '\
<Table items="{path : \'/EMPLOYEES\', parameters : {\
			$select : \'Name\',\
			$filter : \'TEAM_ID eq 42\',\
			$orderby : \'Name desc\'\
		},\
		filters : {path: \'AGE\', operator: \'GT\', value1: 21},\
		sorter : {path : \'AGE\'}\
	}">\
	<ColumnListItem>\
		<Text id="text" text="{Name}" />\
	</ColumnListItem>\
</Table>',
		{"EMPLOYEES?$select=Name&$filter=(AGE%20gt%2021)%20and%20(TEAM_ID%20eq%2042)&$orderby=AGE,Name%20desc&$skip=0&$top=100" :
			{"value" : [{"Name" : "Frederic Fall"}, {"Name" : "Jonathan Smith"}]}},
		{"text" : ["Frederic Fall", "Jonathan Smith"]}
	);

	//*********************************************************************************************
	// Scenario: Nested list binding with own parameters causes a second request.
	// This scenario is similar to the "Sales Order Line Items" in the SalesOrders application.
	testViewStart("Absolute ODCB with parameters and relative ODLB with parameters", '\
<FlexBox binding="{path : \'/EMPLOYEES(\\\'2\\\')\', parameters : {$select : \'Name\'}}">\
	<Text id="name" text="{Name}" />\
	<Table items="{path : \'EMPLOYEE_2_EQUIPMENTS\', parameters : {$select : \'Category\'}}">\
		<ColumnListItem>\
			<Text id="category" text="{Category}" />\
		</ColumnListItem>\
	</Table>\
</FlexBox>',
		{
			"EMPLOYEES('2')?$select=Name" : {"Name" : "Frederic Fall"},
			"EMPLOYEES('2')/EMPLOYEE_2_EQUIPMENTS?$select=Category&$skip=0&$top=100" :
				{"value" : [{"Category" : "Electronics"}, {"Category" : "Furniture"}]}
		},
		{"name" : "Frederic Fall", "category" : ["Electronics", "Furniture"]}
	);

	//*********************************************************************************************
	// Scenario: Function import.
	// This scenario is similar to the "Favorite product ID" in the SalesOrders application. In the
	// SalesOrders application the binding context is set programmatically. This example directly
	// triggers the function import.
	testViewStart("FunctionImport", '\
<FlexBox binding="{/GetEmployeeByID(EmployeeID=\'2\')}">\
	<Text id="text" text="{Name}" />\
</FlexBox>',
		{"GetEmployeeByID(EmployeeID='2')" : {"Name" : "Frederic Fall"}},
		{"text" : "Frederic Fall"}
	);

	//*********************************************************************************************
	// Scenario: inherit query options (see ListBinding sample application)
	// If there is a relative binding without an own cache and the parent binding defines $orderby
	// or $filter for that binding, then these values need to be considered if that binding gets
	// dynamic filters or sorters.
	// See ListBinding sample application:
	// * Start the application; the employee list of the team is initially sorted by "City"
	// * Sort by any other column (e.g. "Employee Name" or "Age") and check that the "City" is taken
	//   as a secondary sort criterion
	// In this test dynamic filters are used instead of dynamic sorters
	QUnit.test("Relative ODLB inherits parent OBCB's query options on filter", function (assert) {
		var sView = '\
<FlexBox binding="{path : \'/TEAMS(\\\'42\\\')\',\
	parameters : {$expand : {TEAM_2_EMPLOYEES : {$orderby : \'AGE\', $select : \'Name\'}}}}">\
	<Table id="table" items="{TEAM_2_EMPLOYEES}">\
		<ColumnListItem>\
			<Text id="text" text="{Name}" />\
		</ColumnListItem>\
	</Table>\
</FlexBox>',
			that = this;

		this.expectRequest("TEAMS('42')?$expand=TEAM_2_EMPLOYEES($orderby=AGE;$select=Name)", {
				"TEAM_2_EMPLOYEES" : [
					{"Name" : "Frederic Fall"},
					{"Name" : "Jonathan Smith"},
					{"Name" : "Peter Burke"}
				]
			})
			.expectChange("text", ["Frederic Fall", "Jonathan Smith", "Peter Burke"]);
		return this.createView(assert, sView).then(function () {
			that.expectRequest(
					"TEAMS('42')/TEAM_2_EMPLOYEES?$orderby=AGE&$select=Name&$filter=AGE%20gt%2042"
						+ "&$skip=0&$top=100",
					{"value" : [{"Name" : "Frederic Fall"}, {"Name" : "Peter Burke"}]})
				.expectChange("text", "Peter Burke", 1);

			// code under test
			that.oView.byId("table").getBinding("items")
				.filter(new Filter("AGE", FilterOperator.GT, 42));
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Sort a list and select a list entry to see details
	// See SalesOrders application:
	// * Start the application with realOData=true so that sorting by "Gross Amount" is enabled
	// * Sort by "Gross Amount"
	// * Select a sales order and see that sales order details are fitting to the selected sales
	//   order
	// This test is a simplification of that scenario with a different service.
	QUnit.test("Absolute ODLB with sort, relative ODCB resolved on selection", function (assert) {
		var sView = '\
<Table id="table" items="{path : \'/EMPLOYEES\', parameters : {$expand : \'EMPLOYEE_2_MANAGER\'}}">\
	<ColumnListItem>\
		<Text id="name" text="{Name}" />\
	</ColumnListItem>\
</Table>\
<FlexBox id="form" binding="{EMPLOYEE_2_MANAGER}">\
	<Text id="id" text="{ID}" />\
</FlexBox>',
			that = this;

		this.expectRequest("EMPLOYEES?$expand=EMPLOYEE_2_MANAGER&$skip=0&$top=100", {
				"value" : [
					{"Name" : "Jonathan Smith", "EMPLOYEE_2_MANAGER" : {"ID" : "2"}},
					{"Name" : "Frederic Fall", "EMPLOYEE_2_MANAGER" : {"ID" : "1"}}
				]
			})
			.expectChange("id")
			.expectChange("name", ["Jonathan Smith", "Frederic Fall"]);

		return this.createView(assert, sView).then(function () {
			that.expectRequest(
				"EMPLOYEES?$expand=EMPLOYEE_2_MANAGER&$orderby=Name&$skip=0&$top=100", {
					"value" : [
						{"Name" : "Frederic Fall", "EMPLOYEE_2_MANAGER" : {"ID" : "1"}},
						{"Name" : "Jonathan Smith", "EMPLOYEE_2_MANAGER" : {"ID" : "2"}}
					]
				})
				.expectChange("name", ["Frederic Fall", "Jonathan Smith"]);

			// code under test
			that.oView.byId("table").getBinding("items").sort(new Sorter("Name"));

			return that.waitForChanges(assert);
		}).then(function () {
			that.expectChange("id", "2");

			// code under test
			that.oView.byId("form").setBindingContext(
				that.oView.byId("table").getBinding("items").getCurrentContexts()[1]);

			return that.waitForChanges(assert);
		}).then(function () {
// TODO Why is formatter on property binding in form called twice for the below?
			that.expectChange("id", "1")
				.expectChange("id", "1");

			// code under test
			that.oView.byId("form").setBindingContext(
				that.oView.byId("table").getBinding("items").getCurrentContexts()[0]);

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Refresh an ODataListBinding
	// See SalesOrders application:
	// * Start the application
	// * Click on "Refresh sales orders" button
	// This test is a simplification of that scenario with a different service.
	QUnit.test("Absolute ODLB refresh", function (assert) {
		var sView = '\
<Table id="table" items="{/EMPLOYEES}">\
	<ColumnListItem>\
		<Text id="name" text="{Name}" />\
	</ColumnListItem>\
</Table>',
			that = this;

		this.expectRequest("EMPLOYEES?$skip=0&$top=100", {
				"value" : [
					{"Name" : "Jonathan Smith"},
					{"Name" : "Frederic Fall"}
				]
			})
			.expectChange("name", ["Jonathan Smith", "Frederic Fall"]);

		return this.createView(assert, sView).then(function () {
			that.expectRequest("EMPLOYEES?$skip=0&$top=100", {
					"value" : [
						{"Name" : "Frederic Fall"},
						{"Name" : "Peter Burke"}
					]
				})
				.expectChange("name", ["Frederic Fall", "Peter Burke"]);

			// code under test
			that.oView.byId("table").getBinding("items").refresh();

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Refresh an ODataContextBinding
	// The SalesOrders application does not have such a scenario.
	QUnit.test("Absolute ODCB refresh", function (assert) {
		var sView = '\
<FlexBox id="form" binding="{/EMPLOYEES(\'2\')}">\
	<Text id="text" text="{Name}" />\
</FlexBox>',
			that = this;

		this.expectRequest("EMPLOYEES('2')", {"Name" : "Jonathan Smith"})
			.expectChange("text", "Jonathan Smith");

		return this.createView(assert, sView).then(function () {
			that.expectRequest("EMPLOYEES('2')", {"Name" : "Jonathan Smith"})
				.expectChange("text", "Jonathan Smith");

			// code under test
			that.oView.byId("form").getObjectBinding().refresh();

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Refresh an ODataPropertyBinding
	// See SalesOrders application:
	// * Start the application
	// * Click on "Refresh favorite product" button
	// This test is a simplification of that scenario with a different service.
	QUnit.test("Absolute ODPB refresh", function (assert) {
		var sView = '<Text id="name" text="{/EMPLOYEES(\'2\')/Name}" />',
			that = this;

		this.expectRequest("EMPLOYEES('2')/Name", {"value" : "Jonathan Smith"})
			.expectChange("name", "Jonathan Smith");

		return this.createView(assert, sView).then(function () {
			that.expectRequest("EMPLOYEES('2')/Name", {"value" : "Jonathan Schmidt"})
				.expectChange("name", "Jonathan Schmidt");

			// code under test
			that.oView.byId("name").getBinding("text").refresh();

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Action Imports
	// See ListBinding application:
	// * Start the application
	// * Click on "Budget" button
	// * In the "Change Team Budget" dialog enter a "Budget" and press "Change" button
	QUnit.test("ActionImport", function (assert) {
		var sView = '\
<FlexBox id="form" binding="{/ChangeTeamBudgetByID(...)}">\
	<Text id="name" text="{Name}" />\
</FlexBox>',
			that = this;

		//TODO Why is formatter called with null and not undefined?
		this.expectChange("name", null);

		return this.createView(assert, sView).then(function () {
			that.expectRequest({
					method : "POST",
					url : "ChangeTeamBudgetByID",
					headers : {"If-Match" : undefined},
					payload : {"Budget" : "1234.1234", "TeamID" : "TEAM_01"}
				}, {"Name" : "Business Suite"})
				.expectChange("name", "Business Suite");

			// code under test
			that.oView.byId("form").getObjectBinding()
				.setParameter("TeamID", "TEAM_01")
				.setParameter("Budget", "1234.1234")
				.execute();

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Changing the binding parameters causes a refresh of the table
	// The SalesOrders application does not have such a scenario.
	QUnit.test("Absolute ODLB changing parameters", function (assert) {
		var sView = '\
<Table id="table" items="{path : \'/EMPLOYEES\', parameters : {$select : \'Name\'}}">\
	<ColumnListItem>\
		<Text id="name" text="{Name}" />\
	</ColumnListItem>\
</Table>',
			that = this;

		this.expectRequest("EMPLOYEES?$select=Name&$skip=0&$top=100", {
				"value" : [
					{"Name" : "Jonathan Smith"},
					{"Name" : "Frederic Fall"}
				]
			})
			.expectChange("name", ["Jonathan Smith", "Frederic Fall"]);

		return this.createView(assert, sView).then(function () {
			that.expectRequest("EMPLOYEES?$select=ID,Name&$search=Fall&$skip=0&$top=100", {
					"value" : [{"ID": "2", "Name" : "Frederic Fall"}]
				})
				.expectChange("name", ["Frederic Fall"]);

			// code under test
			that.oView.byId("table").getBinding("items").changeParameters({
				"$search" : "Fall", "$select" : "ID,Name"});

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Changing the binding parameters causes a refresh of the form
	// The SalesOrders application does not have such a scenario.
	QUnit.test("Absolute ODCB changing parameters", function (assert) {
		var sView = '\
<FlexBox id="form" binding="{/EMPLOYEES(\'2\')}">\
	<Text id="text" text="{Name}" />\
</FlexBox>',
			that = this;

		that.expectRequest("EMPLOYEES('2')", {"Name" : "Jonathan Smith"})
			.expectChange("text", "Jonathan Smith");

		return this.createView(assert, sView).then(function () {
			that.expectRequest("EMPLOYEES('2')?$apply=foo", {"Name" : "Jonathan Schmidt"})
				.expectChange("text", "Jonathan Schmidt");

			// code under test
			that.oView.byId("form").getObjectBinding().changeParameters({"$apply" : "foo"});

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario:
	// A table uses the list binding with extended change detection, but not all key properties of
	// the displayed entity are known on the client, so that the key predicate cannot be determined.
	// In 1.44 this caused the problem that the table did not show any row. (Not reproducible with
	// Gateway services, because they always deliver all key properties, selected or not.)
	QUnit.test("Absolute ODLB with ECD, missing key column", function (assert) {
		// Note: The key property of the EMPLOYEES set is 'ID'
		var sView = '\
<Table growing="true" items="{path : \'/EMPLOYEES\', parameters : {$select : \'Name\'}}">\
	<ColumnListItem>\
		<Text id="name" text="{Name}" />\
	</ColumnListItem>\
</Table>';

		this.expectRequest("EMPLOYEES?$select=Name&$skip=0&$top=20", {
				"value" : [
					{"Name" : "Jonathan Smith"},
					{"Name" : "Frederic Fall"}
				]
			})
			.expectChange("name", ["Jonathan Smith", "Frederic Fall"]);

		return this.createView(assert, sView);
	});

	//*********************************************************************************************
	// Scenario: SalesOrders app
	// * Select a sales order so that items are visible
	// * Filter in the items, so that there are less
	// * See that the count decreases
	// The test simplifies it: It filters in the sales orders list directly
	QUnit.test("ODLB: $count and filter()", function (assert) {
		var sView = '\
<Text id="count" text="{$count}"/>\
<Table id="table" items="{path : \'/SalesOrderList\', parameters : {$select : \'SalesOrderID\'}}">\
	<ColumnListItem>\
		<Text id="id" text="{SalesOrderID}" />\
	</ColumnListItem>\
</Table>',
			that = this;

		that.expectRequest("SalesOrderList?$select=SalesOrderID&$skip=0&$top=100", {
				"value" : [
					{"SalesOrderID" : "0500000001"},
					{"SalesOrderID" : "0500000002"}
				]
			})
			.expectChange("count")
			.expectChange("id", ["0500000001", "0500000002"]);

		return this.createView(assert, sView, createSalesOrdersModel()).then(function () {
			that.expectChange("count", "2");

			// code under test
			that.oView.byId("count").setBindingContext(
				that.oView.byId("table").getBinding("items").getHeaderContext());

			return that.waitForChanges(assert);
		}).then(function () {
			that.expectRequest("SalesOrderList?$select=SalesOrderID&$filter=SalesOrderID%20gt"
					+ "%20'0500000001'&$skip=0&$top=100",
					{"value" : [{"SalesOrderID" : "0500000002"}]}
				)
				.expectChange("count", "1")
				.expectChange("id", ["0500000002"]);

			// code under test
			that.oView.byId("table").getBinding("items")
				.filter(new Filter("SalesOrderID", FilterOperator.GT, "0500000001"));

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: SalesOrders app
	// * Sort the sales orders
	// * Delete a sales order
	// * See that the count decreases
	// The delete is used to change the count (to see that it is still updated)
	QUnit.test("ODLB: $count and sort()", function (assert) {
		var sView = '\
<Text id="count" text="{$count}"/>\
<Table id="table" items="{path : \'/SalesOrderList\', parameters : {$select : \'SalesOrderID\'}}">\
	<ColumnListItem>\
		<Text id="id" text="{SalesOrderID}" />\
	</ColumnListItem>\
</Table>',
		that = this;

		this.expectRequest("SalesOrderList?$select=SalesOrderID&$skip=0&$top=100", {
				"value" : [
					{"SalesOrderID" : "0500000001"},
					{"SalesOrderID" : "0500000002"}
				]
			})
			.expectChange("count") // ensures that count is observed
			.expectChange("id", ["0500000001", "0500000002"]);

		return this.createView(assert, sView, createSalesOrdersModel()).then(function () {
			that.expectChange("count", "2");

			// code under test
			that.oView.byId("count").setBindingContext(
				that.oView.byId("table").getBinding("items").getHeaderContext());

			return that.waitForChanges(assert);
		}).then(function () {
			that.expectRequest(
				"SalesOrderList?$select=SalesOrderID&$orderby=SalesOrderID%20desc&$skip=0&$top=100",
				{
					"value" : [
						{"SalesOrderID" : "0500000002"},
						{"SalesOrderID" : "0500000001"}
					]
				})
				.expectChange("id", ["0500000002", "0500000001"]);

			// code under test
			that.oView.byId("table").getBinding("items").sort(new Sorter("SalesOrderID", true));

			return that.waitForChanges(assert);
		}).then(function () {
			that.expectRequest({
					method : "DELETE",
					url : "SalesOrderList('0500000002')",
					headers : {"If-Match" : undefined}
				})
				.expectChange("count", "1")
				.expectChange("id", ["0500000001"]);

			// code under test
			that.oView.byId("table").getItems()[0].getBindingContext().delete();

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: (not possible with the SalesOrders app)
	// * Add a filter to the sales orders list using changeParameters(), so that there are less
	// * See that the count decreases
	QUnit.test("ODLB: $count and changeParameters()", function (assert) {
		var sView = '\
<Text id="count" text="{$count}"/>\
<Table id="table" items="{path : \'/SalesOrderList\', parameters : {$select : \'SalesOrderID\'}}">\
	<ColumnListItem>\
		<Text id="id" text="{SalesOrderID}" />\
	</ColumnListItem>\
</Table>',
			that = this;

		that.expectRequest("SalesOrderList?$select=SalesOrderID&$skip=0&$top=100", {
				"value" : [
					{"SalesOrderID" : "0500000001"},
					{"SalesOrderID" : "0500000002"}
				]
			})
			.expectChange("count")
			.expectChange("id", ["0500000001", "0500000002"]);

		return this.createView(assert, sView, createSalesOrdersModel()).then(function () {
			that.expectChange("count", "2");

			// code under test
			that.oView.byId("count").setBindingContext(
				that.oView.byId("table").getBinding("items").getHeaderContext());

			return that.waitForChanges(assert);
		}).then(function () {
			that.expectRequest(
					"SalesOrderList?$select=SalesOrderID&$filter=SalesOrderID%20gt%20'0500000001'&"
						+ "$skip=0&$top=100",
					{"value" : [{"SalesOrderID" : "0500000002"}]}
				)
				.expectChange("count", "1")
				.expectChange("id", ["0500000002"]);

			// code under test
			that.oView.byId("table").getBinding("items")
				.changeParameters({$filter : "SalesOrderID gt '0500000001'"});

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: SalesOrders app
	// * Select a sales order
	// * Refresh the sales order list
	// * See that the count of the items is still visible
	// The key point is that the parent of the list is a ContextBinding.
	QUnit.test("ODLB: refresh via parent context binding, shared cache", function (assert) {
		var sView = '\
<FlexBox id="form" binding="{path :\'/SalesOrderList(\\\'0500000001\\\')\', \
		parameters : {$expand : {SO_2_SOITEM : {$select : \'ItemPosition\'}}}}">\
	<Text id="count" text="{headerContext>$count}"/>\
	<Table id="table" items="{SO_2_SOITEM}">\
		<ColumnListItem>\
			<Text id="item" text="{ItemPosition}" />\
		</ColumnListItem>\
	</Table>\
</FlexBox>',
			that = this;

		this.expectRequest("SalesOrderList('0500000001')?$expand=SO_2_SOITEM($select=ItemPosition)",
			{
				"SalesOrderID" : "0500000001",
				"SO_2_SOITEM" : [
					{"ItemPosition" : "0000000010"},
					{"ItemPosition" : "0000000020"},
					{"ItemPosition" : "0000000030"}
				]
			})
			.expectChange("count")
			.expectChange("item", ["0000000010", "0000000020", "0000000030"]);

		return this.createView(assert, sView, createSalesOrdersModel()
		).then(function () {
			var oCount = that.oView.byId("count");

			that.expectChange("count", "3");

			// code under test
			that.oView.setModel(that.oView.getModel(), "headerContext");
			oCount.setBindingContext(
				that.oView.byId("table").getBinding("items").getHeaderContext(),
					"headerContext");

			return that.waitForChanges(assert);
		}).then(function () {
			// Respond with one employee less to show that the refresh must destroy the bindings for
			// the last row. Otherwise the property binding for that row will cause a "Failed to
			// drill down".
			that.expectRequest(
					"SalesOrderList('0500000001')?$expand=SO_2_SOITEM($select=ItemPosition)", {
						"SalesOrderID" : "0500000001",
						"SO_2_SOITEM" : [
							{"ItemPosition" : "0000000010"},
							{"ItemPosition" : "0000000030"}
						]
					})
				.expectChange("count", "2")
				.expectChange("item", "0000000030", 1);

			// code under test
			that.oView.byId("form").getObjectBinding().refresh();

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Modify a property which does not belong to the parent binding's entity
	QUnit.test("Modify a foreign property", function (assert) {
		var sView = '\
<Table id="table" items="{/SalesOrderList}">\
	<ColumnListItem>\
		<Text id="item" text="{SO_2_BP/CompanyName}" />\
	</ColumnListItem>\
</Table>',
			oModel = createSalesOrdersModel({autoExpandSelect : true}),
			that = this;

		this.expectRequest("SalesOrderList?$select=SalesOrderID" +
			"&$expand=SO_2_BP($select=BusinessPartnerID,CompanyName)&$skip=0&$top=100", {
				"value" : [{
					"SalesOrderID" : "0500000002",
					"SO_2_BP" : {
						"@odata.etag" : "etag",
						"BusinessPartnerID" : "42",
						"CompanyName" : "Foo"
					}
				}]
			})
			.expectChange("item", ["Foo"]);

		return this.createView(assert, sView, oModel).then(function () {
			that.expectRequest({
					method : "PATCH",
					url : "BusinessPartnerList('42')",
					headers : {
						"If-Match" : "etag"
					},
					payload : {
						"CompanyName" : "Bar"
					}
				}, {
					"CompanyName" : "Bar"
				})
				.expectChange("item", "Bar", 0);

			that.oView.byId("table").getItems()[0].getCells()[0].getBinding("text")
				.setValue("Bar");
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Modify a property, the server responds with 204 (No Content) on the PATCH request.
	// Sample for this behavior: OData V4 TripPin service from odata.org
	QUnit.test("Modify a property, server responds with 204 (No Content)", function (assert) {
		var sView = '<FlexBox binding="{/EMPLOYEES(\'2\')}">\
						<Text id="text" text="{Name}" />\
					</FlexBox>',
			that = this;

		this.expectRequest("EMPLOYEES('2')", {"Name" : "Jonathan Smith"})
			.expectChange("text", "Jonathan Smith");

		return this.createView(assert, sView).then(function () {
			that.expectRequest({
					method : "PATCH",
					url : "EMPLOYEES('2')",
					headers : {
						"If-Match" : undefined
					},
					payload : {
						"Name" : "Jonathan Schmidt"
					}
				}, /*empty 204 response*/ undefined)
				.expectChange("text", "Jonathan Schmidt");

			// code under test
			that.oView.byId("text").getBinding("text").setValue("Jonathan Schmidt");

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Read and modify an entity with key aliases
	QUnit.test("Entity with key aliases", function (assert) {
		var sView = '\
<Table id="table" items="{/EntitiesWithComplexKey}">\
	<ColumnListItem>\
		<Text id="item" text="{Value}" />\
	</ColumnListItem>\
</Table>',
			oModel = createSpecialCasesModel({autoExpandSelect : true}),
			that = this;

		this.expectRequest("EntitiesWithComplexKey?$select=Key/P1,Key/P2,Value&$skip=0&$top=100", {
				"value" : [{
					"Key" : {
						"P1" : "foo",
						"P2" : 42
					},
					"Value" : "Old",
					"@odata.etag" : "etag"
				}]
			})
			.expectChange("item", ["Old"]);

		return this.createView(assert, sView, oModel).then(function () {
			that.expectRequest({
					method : "PATCH",
					url : "EntitiesWithComplexKey(Key1='foo',Key2=42)",
					headers : {
						"If-Match" : "etag"
					},
					payload : {
						"Value" : "New"
					}
				}, {
					"Value" : "New"
				})
				.expectChange("item", "New", 0);

			that.oView.byId("table").getItems()[0].getCells()[0].getBinding("text")
				.setValue("New");
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Create a sales order w/o key properties, enter a note, then submit the batch
	QUnit.test("Create with user input", function (assert) {
		var sView = '\
<Table id="table" items="{/SalesOrderList}">\
	<ColumnListItem>\
		<Text id="note" text="{Note}" />\
	</ColumnListItem>\
</Table>',
			oModel = createSalesOrdersModel({
				autoExpandSelect : true,
				updateGroupId : "update"
			}),
			that = this;

		this.expectRequest("SalesOrderList?$select=Note,SalesOrderID&$skip=0&$top=100", {
				"value" : [{
					"Note" : "foo",
					"SalesOrderID" : "42"
				}]
			})
			.expectChange("note", ["foo"]);

		return this.createView(assert, sView, oModel).then(function () {
			var oTable = that.oView.byId("table");

			that.expectRequest({
					groupId : "update",
					headers : null,
					method : "POST",
					url : "SalesOrderList",
					payload : {
						"@$ui5.transient" : "update",
						"Note" : "bar"
					}
				}, {
					"CompanyName" : "Bar"
				})
				.expectChange("note", "foo", 1)
				.expectChange("note", "baz", 0) // TODO unexpected change
				.expectChange("note", "baz", 0);

			oTable.getBinding("items").create({Note : "bar"});
			oTable.getItems()[0].getCells()[0].getBinding("text").setValue("baz");
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Enable autoExpandSelect mode for an ODataContextBinding with relative
	// ODataPropertyBindings
	// The SalesOrders application does not have such a scenario.
	QUnit.test("Auto-$expand/$select: Absolute ODCB with relative ODPB", function (assert) {
		var sView = '\
<FlexBox binding="{path : \'/EMPLOYEES(\\\'2\\\')\', parameters : {$select : \'AGE,ROOM_ID\'}}">\
	<Text id="name" text="{Name}" />\
	<Text id="city" text="{LOCATION/City/CITYNAME}" />\
</FlexBox>';

		this.expectRequest("EMPLOYEES('2')?$select=AGE,ID,LOCATION/City/CITYNAME,Name,ROOM_ID", {
				"Name" : "Frederic Fall",
				"LOCATION" : {"City" : {"CITYNAME" : "Walldorf"}}
			})
			.expectChange("name", "Frederic Fall")
			.expectChange("city", "Walldorf")
// TODO unexpected changes
			.expectChange("name", "Frederic Fall")
			.expectChange("city", "Walldorf");

		return this.createView(assert, sView, createTeaBusiModel({autoExpandSelect : true}));
	});

	//*********************************************************************************************
	// Scenario: Enable autoExpandSelect mode for an ODataContextBinding with relative
	// ODataPropertyBindings. Refreshing the view is also working.
	// The SalesOrders application does not have such a scenario.
	QUnit.test("Auto-$expand/$select: Absolute ODCB, refresh", function (assert) {
		var sView = '\
<FlexBox id="form" binding="{path : \'/EMPLOYEES(\\\'2\\\')\', parameters : {$select : \'AGE\'}}">\
	<Text id="name" text="{Name}" />\
</FlexBox>',
			that = this;

		this.expectRequest("EMPLOYEES('2')?$select=AGE,ID,Name", {
				"Name" : "Jonathan Smith"
			})
// TODO unexpected change
			.expectChange("name", "Jonathan Smith")
			.expectChange("name", "Jonathan Smith");

		return this.createView(
			assert, sView, createTeaBusiModel({autoExpandSelect : true})
		).then(function () {
			that.expectRequest("EMPLOYEES('2')?$select=AGE,ID,Name", {
					"Name" : "Jonathan Schmidt"
				})
				.expectChange("name", "Jonathan Schmidt");

			// code under test
			that.oView.byId("form").getObjectBinding().refresh();

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Enter an invalid value for worker-age for an ODataPropertyBinding and check that
	// ODatePropertyBinding.resetChanges() restores the value before.
	// The Types application does NOT have such a scenario.
	//*********************************************************************************************
	QUnit.test("reset invalid data state via property binding", function (assert) {
		return this.checkResetInvalidDataState(assert, function (oView) {
			return oView.byId("age").getBinding("text");
		});
	});

	//*********************************************************************************************
	// Scenario: Enter an invalid value for worker-age for an ODataPropertyBinding and check that
	// parent ODataContextBinding.resetChanges() restores the value before.
	// The Types application does have such a scenario (within the V4 view).
	//*********************************************************************************************
	QUnit.test("reset invalid data state via context binding", function (assert) {
		return this.checkResetInvalidDataState(assert, function (oView) {
			return oView.byId("form").getObjectBinding();
		});
	});

	//*********************************************************************************************
	// Scenario: Enter an invalid value for worker-age for an ODataPropertyBinding and check that
	// ODataModel.resetChanges() restores the value before.
	// The Types application does have such a scenario (within the V4 view).
	//*********************************************************************************************
	QUnit.test("reset invalid data state via model", function (assert) {
		return this.checkResetInvalidDataState(assert, function (oView) {
			return oView.getModel();
		});
	});

	//*********************************************************************************************
	// Scenario: Metadata access to Manager which is not loaded yet.
	QUnit.test("Metadata: Manager", function (assert) {
		var sView = '\
<Table id="table" items="{/MANAGERS}">\
	<ColumnListItem>\
		<Text id="item" text="{@sapui.name}" />\
	</ColumnListItem>\
</Table>',
			oModel = createTeaBusiModel().getMetaModel(),
			that = this;

		this.expectChange("item", false);
		return this.createView(assert, sView, oModel).then(function () {
			that.expectChange("item", "ID", "/MANAGERS/ID")
				.expectChange("item", "TEAM_ID", "/MANAGERS/TEAM_ID")
				.expectChange("item", "Manager_to_Team", "/MANAGERS/Manager_to_Team");
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Metadata access to Product which resides in an include
	QUnit.test("Metadata: Product", function (assert) {
		var sView = '\
<Table id="table" items="{/Equipments/EQUIPMENT_2_PRODUCT}">\
	<ColumnListItem>\
		<Text id="item" text="{@sapui.name}" />\
	</ColumnListItem>\
</Table>',
			oModel = createTeaBusiModel().getMetaModel(),
			that = this;

		return oModel.requestObject("/Equipments").then(function () {
			that.expectChange("item", false);
			return that.createView(assert, sView, oModel);
		}).then(function () {
			that.expectChange("item", "ID", "/Equipments/EQUIPMENT_2_PRODUCT/ID")
				.expectChange("item", "Name", "/Equipments/EQUIPMENT_2_PRODUCT/Name")
				.expectChange("item", "SupplierIdentifier",
					"/Equipments/EQUIPMENT_2_PRODUCT/SupplierIdentifier")
				.expectChange("item", "ProductPicture",
					"/Equipments/EQUIPMENT_2_PRODUCT/ProductPicture")
				.expectChange("item", "PRODUCT_2_CATEGORY",
					"/Equipments/EQUIPMENT_2_PRODUCT/PRODUCT_2_CATEGORY")
				.expectChange("item", "PRODUCT_2_SUPPLIER",
					"/Equipments/EQUIPMENT_2_PRODUCT/PRODUCT_2_SUPPLIER");
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Metadata property access to product name. It should be empty initially, but later
	// updated via a change event.
	QUnit.test("Metadata: Product name", function (assert) {
		var sView = '<Text id="product" text="{/Equipments/EQUIPMENT_2_PRODUCT/@sapui.name}" />',
			oModel = createTeaBusiModel().getMetaModel(),
			that = this;

		oModel.setDefaultBindingMode("OneWay");
		return oModel.requestObject("/Equipments").then(function () {
			that.expectChange("product", undefined);
			return that.createView(assert, sView, oModel);
		}).then(function () {
			that.expectChange("product",
					"com.sap.gateway.default.iwbep.tea_busi_product.v0001.Product");
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Metadata property access to product name. It should be empty initially, but later
	// updated via a change event.
	QUnit.test("Metadata: Product name via form", function (assert) {
		var sView = '\
<FlexBox binding="{/Equipments/EQUIPMENT_2_PRODUCT/}">\
	<Text id="product" text="{@sapui.name}" />\
</FlexBox>',
			oModel = createTeaBusiModel().getMetaModel(),
			that = this;

		oModel.setDefaultBindingMode("OneWay");
		return oModel.requestObject("/Equipments").then(function () {
			that.expectChange("product", undefined);
			return that.createView(assert, sView, oModel);
		}).then(function () {
			that.expectChange("product",
					"com.sap.gateway.default.iwbep.tea_busi_product.v0001.Product");
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Metadata access to Managers which is not loaded yet. The binding is unresolved
	// initially and gets a context later. Then switch to Products (becoming asynchronous again).
	QUnit.test("Metadata: Manager -> Product", function (assert) {
		var sView = '\
<Table id="table" items="{}">\
	<ColumnListItem>\
		<Text id="item" text="{@sapui.name}" />\
	</ColumnListItem>\
</Table>',
			oModel = createTeaBusiModel().getMetaModel(),
			that = this;

		oModel.setDefaultBindingMode("OneWay");
		this.expectChange("item", false);
		return this.createView(assert, sView, oModel).then(function () {
			that.expectChange("item", "ID", "/MANAGERS/ID")
				.expectChange("item", "TEAM_ID", "/MANAGERS/TEAM_ID")
				.expectChange("item", "Manager_to_Team", "/MANAGERS/Manager_to_Team");

			that.oView.byId("table").setBindingContext(oModel.getContext("/MANAGERS"));
			return that.waitForChanges(assert);
		}).then(function () {
			that.expectChange("item", "ID", "/Equipments/EQUIPMENT_2_PRODUCT/ID")
				.expectChange("item", "Name", "/Equipments/EQUIPMENT_2_PRODUCT/Name")
				.expectChange("item", "SupplierIdentifier",
					"/Equipments/EQUIPMENT_2_PRODUCT/SupplierIdentifier")
				.expectChange("item", "ProductPicture",
					"/Equipments/EQUIPMENT_2_PRODUCT/ProductPicture")
				.expectChange("item", "PRODUCT_2_CATEGORY",
					"/Equipments/EQUIPMENT_2_PRODUCT/PRODUCT_2_CATEGORY")
				.expectChange("item", "PRODUCT_2_SUPPLIER",
					"/Equipments/EQUIPMENT_2_PRODUCT/PRODUCT_2_SUPPLIER");

			that.oView.byId("table")
				.setBindingContext(oModel.getContext("/Equipments/EQUIPMENT_2_PRODUCT"));
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Enable autoExpandSelect mode for an ODataContextBinding with relative
	// ODataPropertyBindings where the paths of the relative bindings lead to a $expand
	// The SalesOrders application does not have such a scenario.
	QUnit.test("Auto-$expand/$select: Absolute ODCB with relative ODPB, $expand required",
			function (assert) {
		var sView = '\
<FlexBox id="form" binding="{path : \'/EMPLOYEES(\\\'2\\\')\',\
			parameters : {\
				$expand : {\
					EMPLOYEE_2_TEAM : {$select : \'Team_Id\'}\
				},\
				$select : \'AGE\'\
			}\
		}">\
	<Text id="name" text="{EMPLOYEE_2_TEAM/Name}" />\
	<Text id="TEAM_ID" text="{EMPLOYEE_2_TEAM/TEAM_2_MANAGER/TEAM_ID}" />\
</FlexBox>';

		this.expectRequest("EMPLOYEES('2')?$expand=EMPLOYEE_2_TEAM($select=Name,Team_Id"
				+ ";$expand=TEAM_2_MANAGER($select=ID,TEAM_ID))&$select=AGE,ID",
				{
					"AGE": 32,
					"EMPLOYEE_2_TEAM": {
						"Name": "SAP NetWeaver Gateway Content",
						"Team_Id": "TEAM_03",
						"TEAM_2_MANAGER" : {
							"TEAM_ID" : "TEAM_03"
						}
					}
				})
			.expectChange("name", "SAP NetWeaver Gateway Content")
			.expectChange("TEAM_ID", "TEAM_03")
// TODO unexpected changes
			.expectChange("name", "SAP NetWeaver Gateway Content")
			.expectChange("TEAM_ID", "TEAM_03");

		return this.createView(assert, sView, createTeaBusiModel({autoExpandSelect : true}));
	});

	//*********************************************************************************************
	// Scenario: Enable autoExpandSelect mode for nested ODataContextBindings. The inner
	// ODataContextBinding can use its parent binding's cache => it creates no own request.
	QUnit.test("Auto-$expand/$select: Nested ODCB",
			function (assert) {
		var sView = '\
<FlexBox binding="{path : \'/EMPLOYEES(\\\'2\\\')\',\
			parameters : {\
				$expand : {\
					EMPLOYEE_2_MANAGER : {$select : \'ID\'}\
				},\
				$select : \'AGE\'\
			}\
		}">\
	<FlexBox binding="{EMPLOYEE_2_TEAM}">\
		<Text id="name" text="{Name}" />\
	</FlexBox>\
</FlexBox>';

		this.expectRequest("EMPLOYEES('2')?$expand=EMPLOYEE_2_MANAGER"
					+ "($select=ID),EMPLOYEE_2_TEAM($select=Name,Team_Id)&$select=AGE,ID",
				{
					"AGE": 32,
					"EMPLOYEE_2_MANAGER": {
						"ID": "2"
					},
					"EMPLOYEE_2_TEAM": {
						"Name": "SAP NetWeaver Gateway Content"
					}
				})
			.expectChange("name", "SAP NetWeaver Gateway Content")
// TODO unexpected changes
			.expectChange("name", "SAP NetWeaver Gateway Content");

		return this.createView(assert, sView, createTeaBusiModel({autoExpandSelect : true}));
	});

	//*********************************************************************************************
	// Scenario: create an entity on a relative binding without an own cache and check that
	// hasPendingChanges is working
	// None of our applications has such a scenario.
	QUnit.test("Create on a relative binding; check hasPendingChanges()", function (assert) {
		var oTeam2EmployeesBinding,
			oTeamBinding,
			that = this;

		return prepareTestForCreateOnRelativeBinding(this, assert).then(function () {
			oTeam2EmployeesBinding = that.oView.byId("table").getBinding("items");
			oTeamBinding = that.oView.byId("form").getObjectBinding();
			that.expectRequest({
					groupId : "update",
					headers : null,
					method : "POST",
					url : "TEAMS('42')/TEAM_2_EMPLOYEES",
					payload : {
						"@$ui5.transient": "update",
						"ID" : null,
						"Name" : "John Doe"
					}
				}, {"ID" : "7", "Name" : "John Doe"})
				// insert new employee at first row
				.expectChange("id", "", 0)
				.expectChange("text", "John Doe", 0)
				.expectChange("id", "2", 1)
				.expectChange("text", "Frederic Fall", 1);
			oTeam2EmployeesBinding.create({"ID" : null, "Name" : "John Doe"});

			// code under test
			assert.ok(oTeam2EmployeesBinding.hasPendingChanges(), "pending changes; new entity");
			assert.ok(oTeamBinding.hasPendingChanges(), "pending changes; new entity");

			return that.waitForChanges(assert);
		}).then(function () {
			that.expectChange("id", "7", 0);
			assert.throws(function () {
				that.oView.byId("form").bindElement("/TEAMS('43')",
						{$expand : {TEAM_2_EMPLOYEES : {$select : 'ID,Name'}}});
			}, new Error("setContext on relative binding is forbidden if a transient entity exists"
				+ ": sap.ui.model.odata.v4.ODataListBinding: /TEAMS('42')|TEAM_2_EMPLOYEES"));
			that.oModel.submitBatch("update");
			return that.waitForChanges(assert);
		}).then(function () {
			// code under test
			assert.notOk(oTeam2EmployeesBinding.hasPendingChanges(), "no more pending changes");
			assert.notOk(oTeamBinding.hasPendingChanges(), "no more pending changes");
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: create an entity on a relative binding without an own cache and reset changes or
	// delete the newly created entity again
	// None of our applications has such a scenario.
	[true, false].forEach(function (bUseReset) {
		QUnit.test("Create on a relative binding; " + (bUseReset ? "resetChanges()" : "delete"),
				function (assert) {
			var oNewContext,
				oTeam2EmployeesBinding,
				oTeamBinding,
				that = this;

			return prepareTestForCreateOnRelativeBinding(this, assert).then(function () {
				oTeam2EmployeesBinding = that.oView.byId("table").getBinding("items");
				oTeamBinding = that.oView.byId("form").getObjectBinding();

				// restore requestor to test proper cancel handling without simulating the requestor
				that.oModel.oRequestor.restore();
				that.expectChange("id", "", 0)
					.expectChange("text", "John Doe", 0)
					.expectChange("id", "2", 1)
					.expectChange("text", "Frederic Fall", 1);

				oNewContext = oTeam2EmployeesBinding.create({"ID" : null, "Name" : "John Doe"});
				assert.ok(oTeam2EmployeesBinding.hasPendingChanges(),
					"binding has pending changes");
				assert.ok(oTeamBinding.hasPendingChanges(), "parent has pending changes");
				return that.waitForChanges(assert);
			}).then(function () {
				that.expectChange("id", "2", 0)
					.expectChange("text", "Frederic Fall", 0)
					// TODO why do we get events twice?
					.expectChange("id", "2", 0)
					.expectChange("text", "Frederic Fall", 0);

				// code under test
				if (bUseReset) {
					oTeam2EmployeesBinding.resetChanges();
				} else {
					oNewContext.delete("$direct");
				}

				assert.notOk(oTeam2EmployeesBinding.hasPendingChanges(), "no pending changes");
				assert.notOk(oTeamBinding.hasPendingChanges(), "parent has no pending changes");
				return that.waitForChanges(assert);
			}).then(function () {
				return oNewContext.created().then(function () {
					assert.notOk("unexpected success");
				}, function (oError) {
					assert.strictEqual(oError.canceled, true, "Create canceled");
				});
			});
		});
	});

	//*********************************************************************************************
	// Scenario: Behaviour of a bound action if nothing is available before the execute
	QUnit.test("Bound action", function (assert) {
		var sView = '\
<VBox binding="{/EMPLOYEES(\'1\')}">\
	<VBox id="action" \
			binding="{com.sap.gateway.default.iwbep.tea_busi.v0001.AcChangeTeamOfEmployee(...)}">\
		<Text id="teamId" text="{TEAM_ID}" />\
	</VBox>\
</VBox>',
			that = this;

		this.expectChange("teamId"); // no event initially
		return this.createView(assert, sView).then(function () {
			that.expectRequest("EMPLOYEES('1')", {
					"@odata.etag" : "eTag"
				})
				.expectRequest({
					method : "POST",
					headers : {"If-Match" : "eTag"},
					url : "EMPLOYEES('1')/com.sap.gateway.default.iwbep.tea_busi.v0001"
						+ ".AcChangeTeamOfEmployee",
					payload : {
						"TeamID" : "42"
					}
				}, {
					"TEAM_ID" : "42"
				})
				.expectChange("teamId", null) // TODO unexpected change
				.expectChange("teamId", "42");

			that.oView.byId("action").getObjectBinding().setParameter("TeamID", "42").execute();
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Enable autoExpandSelect on an operation
	QUnit.test("Auto-$expand/$select: Function import", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect : true}),
			sView = '\
<FlexBox id="function" binding="{/GetEmployeeByID(...)}">\
	<Text id="name" text="{Name}" />\
</FlexBox>',
			that = this;

		this.expectChange("name");
		return this.createView(assert, sView, oModel).then(function () {
// TODO the query options for the function import are not enhanced
//			that.expectRequest("GetEmployeeByID(EmployeeID='1')?$select=ID,Name", {
			that.expectRequest("GetEmployeeByID(EmployeeID='1')", {
					"Name" : "Jonathan Smith"
				})
				.expectChange("name", null) // TODO unexpected change
				.expectChange("name", "Jonathan Smith");

			that.oView.byId("function").getObjectBinding()
				.setParameter("EmployeeID", "1")
				.execute();
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Enable autoExpandSelect mode for nested ODataContextBindings. The inner
	// ODataContextBinding *cannot* use its parent binding's cache due to conflicting query options
	// => it creates an own cache and request.
	QUnit.test("Auto-$expand/$select: Nested ODCB with own request",
			function (assert) {
		var sView = '\
<FlexBox binding="{path : \'/EMPLOYEES(\\\'2\\\')\',\
			parameters : {\
				$expand : {\
					EMPLOYEE_2_MANAGER : {$select : \'ID\'},\
					EMPLOYEE_2_TEAM : {\
						$expand : {\
							TEAM_2_EMPLOYEES : {\
								$orderby : \'AGE\'\
							}\
						}\
					}\
				}\
			}\
		}">\
	<FlexBox binding="{path : \'EMPLOYEE_2_TEAM\',\
		parameters : {\
			$expand : {\
				TEAM_2_EMPLOYEES : {\
					$orderby : \'AGE desc\'\
				}\
			}\
		}\
	}">\
		<Text id="name" text="{Name}" />\
	</FlexBox>\
	<Text id="age" text="{AGE}" />\
</FlexBox>';

		this.expectRequest("EMPLOYEES('2')/EMPLOYEE_2_TEAM"
					+ "?$expand=TEAM_2_EMPLOYEES($orderby=AGE%20desc)&$select=Name,Team_Id",
				{
					"Name": "SAP NetWeaver Gateway Content",
					"TEAM_2_EMPLOYEES": [
						{ "AGE" : 32},
						{ "AGE" : 29}
					]
				})
			.expectRequest("EMPLOYEES('2')?$expand=EMPLOYEE_2_MANAGER($select=ID),"
					+ "EMPLOYEE_2_TEAM($expand=TEAM_2_EMPLOYEES($orderby=AGE))&$select=AGE,ID",
				{
					"AGE": 32,
					"EMPLOYEE_2_MANAGER": {
						"ID": "2"
					},
					"EMPLOYEE_2_TEAM": {
						"TEAM_2_EMPLOYEES": [
							{ "AGE" : 29},
							{ "AGE" : 32}
						]
					}
				})
			.expectChange("name", "SAP NetWeaver Gateway Content")
			.expectChange("age", "32")
// TODO unexpected changes
			.expectChange("name", "SAP NetWeaver Gateway Content")
			.expectChange("age", "32");

		return this.createView(assert, sView, createTeaBusiModel({autoExpandSelect : true}));
	});

	//*********************************************************************************************
	// Scenario: Auto-$expand/$select: Absolute ODataListBinding considers $filter set via API,
	// i.e. it changes the initially aggregated query options. Note: It is also possible to remove
	// a filter which must lead to removal of the $filter option.
	QUnit.test("Absolute ODLB with auto-$expand/$select: filter via API", function (assert) {
		var sView = '\
<Table id="table"\
		items="{\
			path : \'/EMPLOYEES\',\
			filters: {path: \'AGE\', operator: \'LT\', value1: \'77\'},\
			parameters : {$orderby : \'Name\', $select : \'AGE\'}\
		}">\
	<ColumnListItem>\
		<Text id="text" text="{Name}" />\
	</ColumnListItem>\
</Table>',
			that = this;

		this.expectRequest("EMPLOYEES?$orderby=Name&$select=AGE,ID,Name&$filter=AGE%20lt%2077"
					+ "&$skip=0&$top=100",
				{
					"value" : [
						{"Name" : "Frederic Fall"},
						{"Name" : "Jonathan Smith"},
						{"Name" : "Peter Burke"}
					]
				}
			)
			.expectChange("text", ["Frederic Fall", "Jonathan Smith", "Peter Burke"]);
		return this.createView(assert, sView, createTeaBusiModel({autoExpandSelect : true}))
			.then(function () {
				that.expectRequest("EMPLOYEES?$orderby=Name&$select=AGE,ID,Name"
							+ "&$filter=AGE%20gt%2042&$skip=0&$top=100",
						{"value" : [{"Name" : "Frederic Fall"}, {"Name" : "Peter Burke"}]})
					.expectChange("text", "Peter Burke", 1);

				// code under test
				that.oView.byId("table").getBinding("items")
					.filter(new Filter("AGE", FilterOperator.GT, 42));
				return that.waitForChanges(assert);
			})
			.then(function () {
				that.expectRequest("EMPLOYEES?$orderby=Name&$select=AGE,ID,Name&$skip=0&$top=100", {
						"value" : [
							{"Name" : "Frederic Fall"},
							{"Name" : "Jonathan Smith"},
							{"Name" : "Peter Burke"}
						]
					})
					.expectChange("text", "Jonathan Smith", 1)
					.expectChange("text", "Peter Burke", 2);

				// code under test
				that.oView.byId("table").getBinding("items").filter(/*no filter*/);
				return that.waitForChanges(assert);
			});
	});

	//*********************************************************************************************
	// Scenario: Auto-$expand/$select: Relative ODataListBinding considers $filter set via API, i.e.
	// it changes the initially aggregated query options and creates a separate cache/request.
	QUnit.test("ODLB with auto-$expand/$select below ODCB: filter via API", function (assert) {
		var sView = '\
<FlexBox binding="{/TEAMS(\'2\')}">\
	<Table id="table" items="{path : \'TEAM_2_EMPLOYEES\', parameters : {$orderby : \'Name\'}}">\
		<ColumnListItem>\
			<Text id="text" text="{Name}" />\
		</ColumnListItem>\
	</Table>\
	<Text id="name" text="{Name}" />\
</FlexBox>',
			that = this;

		this.expectRequest("TEAMS('2')?$select=Name,Team_Id"
					+ "&$expand=TEAM_2_EMPLOYEES($orderby=Name;$select=ID,Name)", {
					"Name" : "Team 2",
					"Team_Id" : "2",
					"TEAM_2_EMPLOYEES" : [
						{"Name" : "Frederic Fall"},
						{"Name" : "Jonathan Smith"},
						{"Name" : "Peter Burke"}
					]
				}
			)
			.expectChange("name", "Team 2")
			.expectChange("name", "Team 2") // TODO unexpected change
			.expectChange("text", ["Frederic Fall", "Jonathan Smith", "Peter Burke"]);
		return this.createView(assert, sView, createTeaBusiModel({autoExpandSelect : true}))
			.then(function () {
				that.expectRequest("TEAMS('2')/TEAM_2_EMPLOYEES?$orderby=Name&$select=ID,Name"
							+ "&$filter=AGE%20gt%2042&$skip=0&$top=100",
						{"value" : [{"Name" : "Frederic Fall"}, {"Name" : "Peter Burke"}]})
					.expectChange("text", "Peter Burke", 1);

				// code under test
				that.oView.byId("table").getBinding("items")
					.filter(new Filter("AGE", FilterOperator.GT, 42));
				return that.waitForChanges(assert);
			});
	});

	//*********************************************************************************************
	// Scenario: child binding has $apply and would need $expand therefore it cannot use its
	// parent binding's cache
	testViewStart("Auto-$expand/$select: no $apply inside $expand", '\
<FlexBox binding="{/TEAMS(\'42\')}">\
	<Table items="{path : \'TEAM_2_EMPLOYEES\', parameters : {$apply : \'filter(AGE lt 42)\'}}">\
		<ColumnListItem>\
			<Text id="text" text="{Name}" />\
		</ColumnListItem>\
	</Table>\
</FlexBox>', {
		"TEAMS('42')/TEAM_2_EMPLOYEES?$apply=filter(AGE%20lt%2042)&$select=ID,Name&$skip=0&$top=100" : {
			"value" : [
				{"Name" : "Frederic Fall"},
				{"Name" : "Peter Burke"}
			]
		}
	}, {"text" :  ["Frederic Fall", "Peter Burke"]}, createTeaBusiModel({autoExpandSelect : true}));

	//*********************************************************************************************
	// Scenario: child binding cannot use its parent list binding's cache (for whatever reason)
	// but must not compute the canonical path for the virtual context
	QUnit.test("Auto-$expand/$select: no canonical path for virtual context", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect : true}),
			sView = '\
<Table items="{/TEAMS}">\
	<ColumnListItem>\
		<List items="{path : \'TEAM_2_EMPLOYEES\',\
			parameters : {$apply : \'filter(AGE lt 42)\'}, templateShareable : false}">\
			<CustomListItem>\
				<Text id="text" text="{Name}" />\
			</CustomListItem>\
		</List>\
	</ColumnListItem>\
</Table>';

		this.expectRequest("TEAMS?$select=Team_Id&$skip=0&$top=100", {
					"value" : [
						{"Team_Id" : "TEAM_01"}
					]
				})
			.expectRequest("TEAMS('TEAM_01')/TEAM_2_EMPLOYEES?$apply=filter(AGE%20lt%2042)"
				+ "&$select=ID,Name&$skip=0&$top=100", {
					"value" : [
						{"Name" : "Frederic Fall"},
						{"Name" : "Peter Burke"}
					]
				})
			.expectChange("text", ["Frederic Fall", "Peter Burke"]);
		return this.createView(assert, sView, oModel);
	});

	//*********************************************************************************************
	// Scenario: master/detail where the detail does not need additional $expand/$select and thus
	// should reuse its parent's cache
	QUnit.test("Auto-$expand/$select: simple master/detail", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect : true}),
			sView = '\
<Table id="master" items="{/TEAMS}">\
	<ColumnListItem>\
		<Text id="text0" text="{Team_Id}" />\
	</ColumnListItem>\
</Table>\
<FlexBox id="detail" binding="{}">\
	<Text id="text1" text="{Team_Id}" />\
</FlexBox>',
			that = this;

		this.expectRequest("TEAMS?$select=Team_Id&$skip=0&$top=100", {
					"value" : [{
						"Team_Id" : "TEAM_01"
					}]
				})
			.expectChange("text0", ["TEAM_01"])
			.expectChange("text1"); // expect a later change

		return this.createView(assert, sView, oModel).then(function () {
			var oContext = that.oView.byId("master").getItems()[0].getBindingContext();

			that.expectChange("text1", "TEAM_01");

			that.oView.byId("detail").setBindingContext(oContext);

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: master/detail where the detail needs additional $expand/$select and thus cannot
	// reuse its parent's cache
	QUnit.test("Auto-$expand/$select: master/detail with separate requests", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect : true}),
			sView = '\
<Table id="master" items="{/TEAMS}">\
	<ColumnListItem>\
		<Text id="text0" text="{Team_Id}" />\
	</ColumnListItem>\
</Table>\
<FlexBox id="detail" binding="{}">\
	<Text id="text1" text="{Name}" />\
</FlexBox>',
			that = this;

		this.expectRequest("TEAMS?$select=Team_Id&$skip=0&$top=100", {
				"value" : [{
					"Team_Id" : "TEAM_01"
				}]
			})
			.expectChange("text0", ["TEAM_01"])
			.expectChange("text1"); // expect a later change

		return this.createView(assert, sView, oModel).then(function () {
			var oContext = that.oView.byId("master").getItems()[0].getBindingContext();

			that.expectRequest("TEAMS('TEAM_01')?$select=Name,Team_Id", {
					"Team_Id" : "TEAM_01",
					"Name" : "Team #1"
				})
				.expectChange("text1", "Team #1");

			that.oView.byId("detail").setBindingContext(oContext);

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Enable autoExpandSelect mode for use with factory function to create a listBinding
	QUnit.test("Auto-$expand/$select: use factory function",
			function (assert) {
		var that = this,
			sView = '\
<Table id="table" items="{\
		factory: \'.employeesListFactory\',\
		parameters : {\
			$select : \'AGE,ID\'\
		},\
		path: \'/EMPLOYEES\'\
	}">\
</Table>',
			oController = {
				employeesListFactory : function (sID, oContext) {
					var sAge,
						oListItem;

					sAge = oContext.getProperty("AGE");
					if (sAge > 30) {
						oListItem = new Text(sID, {
							text : "{AGE}"
						});
					} else {
						oListItem = new Text(sID, {
							text : "{ID}"
						});
					}
					that.setFormatterInList(assert, oListItem, "text");
					return new ColumnListItem({cells : [oListItem]});
				}
			};

		this.expectRequest("EMPLOYEES?$select=AGE,ID&$skip=0&$top=100",
			{ "value" :
				[
					{"AGE" : 29, "ID" : "R2D2"},
					{"AGE" : 36, "ID" : "C3PO"}
				]
			})
			.expectChange("text", ["R2D2", "36"]);

		return this.createView(assert, sView, createTeaBusiModel({autoExpandSelect : true}),
			oController);
	});

	//*********************************************************************************************
	// Scenario: trying to call submitBatch() synchronously after delete(), but there is no way...
	QUnit.test("submitBatch() after delete()", function (assert) {
		var sView = '\
<FlexBox binding="{/TEAMS(\'42\')}" id="form">\
	<Text id="text" text="{Name}" />\
</FlexBox>',
			that = this;

		this.expectRequest("TEAMS('42')", {
			"Team_Id" : "TEAM_01",
			"Name" : "Team #1"
		}).expectChange("text", "Team #1");

		return this.createView(assert, sView).then(function () {
			var oContext = that.oView.byId("form").getBindingContext();

			that.expectRequest({
				headers : {
					"If-Match": undefined
				},
				method : "DELETE",
				url : "TEAMS('42')"
			}).expectChange("text", null);

			// Note: "the resulting group ID must be '$auto' or '$direct'"
			// --> no way to call submitBatch()!
			oContext.delete(/*sGroupId*/);
			assert.throws(function () {
				oContext.getModel().submitBatch("$direct");
			});

			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: call submitBatch() synchronously after changeParameters (BCP 1770236987)
	[false, true].forEach(function (bAutoExpandSelect) {
		var sTitle = "submitBatch after changeParameters, autoExpandSelect = " + bAutoExpandSelect;

		QUnit.test(sTitle, function (assert) {
			var mFrederic = {
					"ID" : "2",
					"Name" : "Frederic Fall"
				},
				mJonathan = {
					"ID" : "3",
					"Name" : "Jonathan Smith"
				},
				oModel = createTeaBusiModel({autoExpandSelect : bAutoExpandSelect}),
				sUrlPrefix = bAutoExpandSelect
					? "EMPLOYEES?$select=ID,Name&"
					: "EMPLOYEES?",
				sView = '\
<Table id="table" items="{path : \'/EMPLOYEES\', parameters : {$$groupId : \'group\'}}">\
	<ColumnListItem>\
		<Text id="text" text="{Name}" />\
	</ColumnListItem>\
</Table>',
				that = this;

			this.expectRequest({
				groupId : "group",
				method : "GET",
				url : sUrlPrefix + "$skip=0&$top=100"
			}, {"value" : [mFrederic, mJonathan]})
				.expectChange("text", false);

			return this.createView(assert, sView, oModel).then(function () {
				that.expectChange("text", ["Frederic Fall", "Jonathan Smith"]);

				oModel.submitBatch("group");

				return that.waitForChanges(assert).then(function () {
					var oListBinding = that.oView.byId("table").getBinding("items");

					that.expectRequest({
						groupId : "group",
						method : "GET",
						url : sUrlPrefix + "$orderby=Name%20desc&$skip=0&$top=100"
					}, {"value" : [mJonathan, mFrederic]})
						.expectChange("text", ["Jonathan Smith", "Frederic Fall"]);

					oListBinding.changeParameters({
						"$orderby" : "Name desc"
					});
					oModel.submitBatch("group");

					return that.waitForChanges(assert);
				});
			});
		});
	});

	//*********************************************************************************************
	// Scenario: Change a property in a dependent binding below a list binding with an own cache and
	// change the list binding's row (-> the dependent binding's context)
	QUnit.test("Pending change in hidden cache", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect : true}),
			sView = '\
<Table id="teamSet" items="{/TEAMS}">\
	<ColumnListItem>\
		<Text id="teamId" text="{Team_Id}" />\
	</ColumnListItem>\
</Table>\
<Table id="employeeSet" items="{path : \'TEAM_2_EMPLOYEES\', parameters : {$orderby : \'Name\'}}">\
	<ColumnListItem>\
		<Text id="employeeId" text="{ID}" />\
	</ColumnListItem>\
</Table>\
<VBox id="objectPage" binding="{path: \'\', parameters : {$$updateGroupId : \'update\'}}">\
	<Text id="employeeName" text="{Name}"/>\
</VBox>',
			that = this;

		this.expectRequest("TEAMS?$select=Team_Id&$skip=0&$top=100",
				{value: [{"Team_Id" : "1"}, {"Team_Id" : "2"}]})
			.expectChange("teamId", ["1", "2"])
			.expectChange("employeeId", false)
			.expectChange("employeeName");

		return this.createView(assert, sView, oModel).then(function () {
			that.expectRequest(
					"TEAMS('1')/TEAM_2_EMPLOYEES?$orderby=Name&$select=ID&$skip=0&$top=100",
					{value : [{ID : "01"}, {ID : "02"}]})
				.expectChange("employeeId", ["01", "02"]);

			// "select" the first row in the team table
			that.oView.byId("employeeSet").setBindingContext(
				that.oView.byId("teamSet").getItems()[0].getBindingContext());
			return that.waitForChanges(assert);
		}).then(function () {
			that.expectRequest("EMPLOYEES('01')?$select=ID,Name", {
					ID : "01",
					Name : "Frederic Fall",
					"@odata.etag" : "eTag"
				})
				.expectChange("employeeName", "Frederic Fall");

			// "select" the first row in the employee table
			that.oView.byId("objectPage").setBindingContext(
				that.oView.byId("employeeSet").getItems()[0].getBindingContext());
			return that.waitForChanges(assert);
		}).then(function () {
			var oListBinding = that.oView.byId("teamSet").getBinding("items");

			that.expectRequest({
					groupId : "update",
					headers : {"If-Match" : "eTag"},
					method : "PATCH",
					payload : {"Name" : "foo"},
					url : "EMPLOYEES('01')"
				})
				.expectChange("employeeName", "foo");

			// Modify the employee name in the object page
			that.oView.byId("employeeName").getBinding("text").setValue("foo");
			assert.ok(oListBinding.hasPendingChanges());

			return that.waitForChanges(assert).then(function () {
				that.expectRequest(
						"TEAMS('2')/TEAM_2_EMPLOYEES?$orderby=Name&$select=ID&$skip=0&$top=100",
						{value : [{ID : "03"}, {ID : "04"}]})
					.expectChange("employeeId", ["03", "04"])
					.expectChange("employeeName", null);

				// "select" the second row in the team table
				that.oView.byId("employeeSet").setBindingContext(
					that.oView.byId("teamSet").getItems()[1].getBindingContext());
				assert.ok(oListBinding.hasPendingChanges());
				return that.waitForChanges(assert);
			});
		});
	});

	//*********************************************************************************************
	// Scenario: Usage of Any/All filter values on the list binding
	[{
		filter : new Filter({
			condition : new Filter("soitem/GrossAmount", FilterOperator.GT, "1000"),
			operator : FilterOperator.Any,
			path : "SO_2_SOITEM",
			variable : "soitem"
		}),
		request : "SO_2_SOITEM/any(soitem:soitem/GrossAmount gt 1000)"
	}, {
		filter : new Filter({
			condition : new Filter({
				and : true,
				filters : [
					new Filter("soitem/GrossAmount", FilterOperator.GT, "1000"),
					new Filter("soitem/NetAmount", FilterOperator.LE, "3000")
				]
			}),
			operator : FilterOperator.Any,
			path : "SO_2_SOITEM",
			variable : "soitem"
		}),
		request : "SO_2_SOITEM/any(soitem:soitem/GrossAmount gt 1000 and"
			+ " soitem/NetAmount le 3000)"
	}, {
		filter : new Filter({
			condition : new Filter({
				filters : [
					new Filter("soitem/GrossAmount", FilterOperator.GT, "1000"),
					new Filter({operator : FilterOperator.Any, path : "soitem/SOITEM_2_SCHDL"})
				]
			}),
			operator : FilterOperator.Any,
			path : "SO_2_SOITEM",
			variable : "soitem"
		}),
		request : "SO_2_SOITEM/any(soitem:soitem/GrossAmount gt 1000 or"
			+ " soitem/SOITEM_2_SCHDL/any())"
	}, {
		filter : new Filter({
			condition : new Filter({
				filters : [
					new Filter("soitem/GrossAmount", FilterOperator.GT, "1000"),
					new Filter({
						condition: new Filter({
							and: true,
							filters: [
								new Filter("schedule/DeliveryDate", FilterOperator.LT,
									"2017-01-01T05:50Z"),
								new Filter("soitem/GrossAmount", FilterOperator.LT, "2000")
							]
						}),
						operator: FilterOperator.All,
						path: "soitem/SOITEM_2_SCHDL",
						variable: "schedule"
					})
				]
			}),
			operator : FilterOperator.Any,
			path : "SO_2_SOITEM",
			variable : "soitem"
		}),
		request : "SO_2_SOITEM/any(soitem:soitem/GrossAmount gt 1000 or"
			+ " soitem/SOITEM_2_SCHDL/all(schedule:schedule/DeliveryDate lt 2017-01-01T05:50Z"
			+ " and soitem/GrossAmount lt 2000))"
	}].forEach(function (oFixture) {
		QUnit.test("filter all/any on list binding " + oFixture.request, function (assert) {
			var sView = '\
<Table id="table" items="{/SalesOrderList}">\
	<ColumnListItem>\
		<Text id="text" text="{SalesOrderID}" />\
	</ColumnListItem>\
</Table>',
				that = this;

			this.expectRequest("SalesOrderList?$skip=0&$top=100", {
				"value": [
					{"SalesOrderID": "0"},
					{"SalesOrderID": "1"},
					{"SalesOrderID": "2"}
				]
			}).expectChange("text", ["0", "1", "2"]);

			return this.createView(assert, sView, createSalesOrdersModel()).then(function () {
				that.expectRequest("SalesOrderList?$filter=" + oFixture.request.replace(/ /g, "%20")
						+ "&$skip=0&$top=100", {
					"value": [
						{"SalesOrderID": "0"},
						{"SalesOrderID": "2"}
					]
				}).expectChange("text", "2", 1);

				// code under test
				that.oView.byId("table").getBinding("items").filter(oFixture.filter);
				return that.waitForChanges(assert);
			});
		});
	});

	//*********************************************************************************************
	// Scenario: Check that the context paths use key predicates if the key properties are delivered
	// in the response. Check that an expand spanning a complex type does not lead to failures.
	QUnit.test("Context Paths Using Key Predicates", function (assert) {
		var sView = '\
<Table id="table" items="{path : \'/EMPLOYEES\',\
		parameters : {$expand : {\'LOCATION/City/EmployeesInCity\' : {$select : [\'Name\']}}, \
		$select : [\'ID\', \'Name\']}}">\
	<ColumnListItem>\
		<Text id="text" text="{Name}" />\
	</ColumnListItem>\
</Table>',
			that = this;

		this.expectRequest("EMPLOYEES?$expand=LOCATION/City/EmployeesInCity($select=Name)" +
					"&$select=ID,Name&$skip=0&$top=100", {
				"value" : [{
					"ID" : "1",
					"Name" : "Frederic Fall",
					"LOCATION" : {
						"City" : {
							"EmployeesInCity" :
								[{"Name" : "Frederic Fall"}, {"Name" : "Jonathan Smith"}]
						}
					}
				}, {
					"ID" : "2",
					"Name" : "Jonathan Smith",
					"LOCATION" : {
						"City" : {
							"EmployeesInCity" :
								[{"Name" : "Frederic Fall"}, {"Name" : "Jonathan Smith"}]
						}
					}
				}]
			}).expectChange("text", ["Frederic Fall", "Jonathan Smith"]);

		return this.createView(assert, sView).then(function () {
			assert.deepEqual(that.oView.byId("table").getItems().map(function (oItem) {
				return oItem.getBindingContext().getPath();
			}), ["/EMPLOYEES('1')", "/EMPLOYEES('2')"]);
		});
	});

	//*********************************************************************************************
	// Scenario: stream property with @odata.mediaReadLink
	QUnit.test("stream property with @odata.mediaReadLink", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect: true}),
			sView = '\
<FlexBox binding="{/Equipments(\'1\')/EQUIPMENT_2_PRODUCT}">\
	<Text id="url" text="{ProductPicture/Picture}"/>\
</FlexBox>';

		this.expectRequest("Equipments('1')/EQUIPMENT_2_PRODUCT?$select=ID,ProductPicture/Picture",
			{
				"ID" : "42",
				"ProductPicture" : {
					"Picture@odata.mediaReadLink" : "ProductPicture('42')"
				}
			})
			.expectChange("url",
				"/sap/opu/odata4/IWBEP/TEA/default/IWBEP/TEA_BUSI/0001/ProductPicture('42')")
			.expectChange("url", // TODO unexpected change
				"/sap/opu/odata4/IWBEP/TEA/default/IWBEP/TEA_BUSI/0001/ProductPicture('42')");
		return this.createView(assert, sView, oModel);
	});

	//*********************************************************************************************
	// Scenario: update a quantity. The corresponding unit of measure must be sent, too.
	QUnit.test("Update quantity", function (assert) {
		var sView = '\
<FlexBox binding="{/SalesOrderList(\'42\')/SO_2_SOITEM(\'10\')}">\
	<Text id="quantity" text="{Quantity}"/>\
	<Text id="quantityUnit" text="{QuantityUnit}"/>\
</FlexBox>',
			oModel = createSalesOrdersModel({autoExpandSelect : true}),
			that = this;

		this.expectRequest("SalesOrderList('42')/SO_2_SOITEM('10')?" +
			"$select=ItemPosition,Quantity,QuantityUnit,SalesOrderID", {
				"@odata.etag" : "etag",
				"Quantity" : "10.000",
				"QuantityUnit" : "EA"
			})
			.expectChange("quantity", "10.000") // TODO duplicate change event
			.expectChange("quantity", "10.000")
			.expectChange("quantityUnit", "EA")
			.expectChange("quantityUnit", "EA");

		return this.createView(assert, sView, oModel).then(function () {
			that.expectRequest({
					method : "PATCH",
					url : "SalesOrderList('42')/SO_2_SOITEM('10')",
					headers : {
						"If-Match" : "etag"
					},
					payload : {
						"Quantity" : "11.000",
						"QuantityUnit" : "EA"
					}
				}, {
					"@odata.etag" : "changed",
					"Quantity" : "11.000",
					"QuantityUnit" : "EA"
				})
				.expectChange("quantity", "11.000");

			that.oView.byId("quantity").getBinding("text").setValue("11.000");
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: PATCH an entity which is read via navigation from a complex type
	QUnit.test("PATCH entity below a complex type", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect : true}),
			sView = '\
<FlexBox binding="{/EMPLOYEES(\'1\')}">\
	<Table id="table" items="{LOCATION/City/EmployeesInCity}">\
		<ColumnListItem>\
			<Text id="room" text="{ROOM_ID}"/>\
		</ColumnListItem>\
	</Table>\
</FlexBox>',
			that = this;

		this.expectRequest("EMPLOYEES('1')?$select=ID"
				+ "&$expand=LOCATION/City/EmployeesInCity($select=ID,ROOM_ID)", {
			"ID" : "1",
			"LOCATION" : {
				"City" : {
					"EmployeesInCity" : [{
						"ID" : "1",
						"ROOM_ID" : "1.01",
						"@odata.etag" : "eTag"
					}]
				}
			}
		}).expectChange("room", ["1.01"]);

		return this.createView(assert, sView, oModel).then(function () {
			that.expectRequest({
				method : "PATCH",
				url : "EMPLOYEES('1')",
				headers : {
					"If-Match" : "eTag"
				},
				payload : {
					"ROOM_ID" : "1.02"
				}
			}).expectChange("room", "1.02", 0);

			that.oView.byId("table").getItems()[0].getCells()[0].getBinding("text")
				.setValue("1.02");
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: test conversion of $select and $expand for V2 Adapter
	// Usage of service: sap/opu/odata/IWBEP/GWSAMPLE_BASIC/
	QUnit.test("V2 Adapter: select in expand", function (assert) {
		var sView = '\
<FlexBox id="form" binding="{path :\'/SalesOrderSet(\\\'0500000001\\\')\', \
		parameters : {\
			$expand : {ToLineItems : {$select : \'ItemPosition\'}}, \
			$select : \'SalesOrderID\'\
		}}">\
	<Text id="id" text="{path : \'SalesOrderID\', type : \'sap.ui.model.odata.type.String\'}" />\
	<Table id="table" items="{ToLineItems}">\
		<ColumnListItem>\
			<Text id="item" text="{path : \'ItemPosition\',\
				type : \'sap.ui.model.odata.type.String\'}" />\
		</ColumnListItem>\
	</Table>\
</FlexBox>',
			oModel = this.createModelForV2SalesOrderService({
				annotationURI : "/sap/opu/odata/IWBEP/GWSAMPLE_BASIC/annotations.xml"
			});

		this.expectRequest("SalesOrderSet('0500000001')?$expand=ToLineItems" +
				"&$select=ToLineItems/ItemPosition,SalesOrderID",
			{
				"SalesOrderID" : "0500000001",
				"ToLineItems" : [
					{"ItemPosition" : "0000000010"},
					{"ItemPosition" : "0000000020"},
					{"ItemPosition" : "0000000030"}
				]
			})
			.expectChange("id", "0500000001")
			.expectChange("id", "0500000001") // TODO duplicate change event
			.expectChange("item", ["0000000010", "0000000020", "0000000030"]);

		// code under test
		return this.createView(assert, sView, oModel).then(function () {
			assert.deepEqual(
				oModel.getMetaModel().getObject(
					"/SalesOrderSet/NetAmount@Org.OData.Measures.V1.ISOCurrency"),
				{"$Path" : "CurrencyCode"});
		});
	});

	//*********************************************************************************************
	// Scenario: test conversion of $orderby for V2 Adapter
	// Usage of service: sap/opu/odata/IWBEP/GWSAMPLE_BASIC/
	QUnit.test("V2 Adapter: $orderby", function (assert) {
		var sView = '\
<Table id="table" items="{path :\'/SalesOrderSet\',\
		parameters : {\
			$select : \'SalesOrderID\',\
			$orderby : \'SalesOrderID\'\
		}}">\
	<ColumnListItem>\
		<Text id="id" text="{SalesOrderID}" />\
	</ColumnListItem>\
</Table>',
			oModel = this.createModelForV2SalesOrderService({
				annotationURI : "/sap/opu/odata/IWBEP/GWSAMPLE_BASIC/annotations.xml"
			});

		this.expectRequest("SalesOrderSet?$orderby=SalesOrderID&$select=SalesOrderID" +
				"&$skip=0&$top=100",
			{
				"value" : [
					{"SalesOrderID" : "0500000001"},
					{"SalesOrderID" : "0500000002"},
					{"SalesOrderID" : "0500000003"}
				]
			})
			.expectChange("id", ["0500000001", "0500000002", "0500000003"]);

		// code under test
		return this.createView(assert, sView, oModel);
	});

	//*********************************************************************************************
	[{
		binding : "CreatedAt ge 2017-05-23T00:00:00Z",
		request : "CreatedAt%20ge%20datetime'2017-05-23T00:00:00'"
	}, {
		binding : "Note eq null",
		request : "Note%20eq%20null"
	}, {
		binding : "2017-05-23T00:00:00Z ge CreatedAt",
		request : "datetime'2017-05-23T00:00:00'%20ge%20CreatedAt"
	}].forEach(function (oFixture) {
		// Scenario: test conversion of $filter for V2 Adapter
		// Usage of service: sap/opu/odata/IWBEP/GWSAMPLE_BASIC/
		QUnit.test("V2 Adapter: $filter=" + oFixture.binding, function (assert) {
			var sView = '\
<Table id="table" items="{path :\'/SalesOrderSet\',\
		parameters : {\
			$select : \'SalesOrderID\',\
			$filter : \'' + oFixture.binding + '\'\
		}}">\
	<ColumnListItem>\
		<Text id="id" text="{SalesOrderID}" />\
	</ColumnListItem>\
</Table>';

			this.expectRequest("SalesOrderSet?$filter=" + oFixture.request + "&$select=SalesOrderID"
					+ "&$skip=0&$top=100",
				{"value" : [
						{"SalesOrderID" : "0500000001"},
						{"SalesOrderID" : "0500000002"},
						{"SalesOrderID" : "0500000003"}
					]
				})
				.expectChange("id", ["0500000001", "0500000002", "0500000003"]);

			// code under test
			return this.createView(assert, sView, this.createModelForV2SalesOrderService());
		});
	});

	//*********************************************************************************************
	// Scenario: Minimal test for two absolute ODataPropertyBindings using different auto groups.
	QUnit.test("Absolute ODPBs using different $auto groups", function (assert) {
		var sView = '\
<Text id="text1" text="{\
	path : \'/EMPLOYEES(\\\'2\\\')/Name\',\
	parameters : {$$groupId : \'group1\'}}" />\
<Text id="text2" text="{\
	path : \'/EMPLOYEES(\\\'3\\\')/Name\',\
	parameters : {$$groupId : \'group2\'}}"\
/>';

		this.expectRequest({url: "EMPLOYEES('2')/Name", groupId: "group1", method: "GET"},
				{value : "Frederic Fall"})
			.expectRequest({url: "EMPLOYEES('3')/Name", groupId: "group2", method: "GET"},
				{value : "Jonathan Smith"})
			.expectChange("text1", "Frederic Fall")
			.expectChange("text2", "Jonathan Smith");
		return this.createView(assert, sView,
			createTeaBusiModel({
				groupProperties : {
					"group1" : {submit : "Direct"},
					"group2" : {submit : "Direct"}
				}
			})
		);
	});

	//*********************************************************************************************
	// Scenario: sap.ui.table.Table with VisibleRowCountMode="Auto" only calls ODLB.getContexts()
	// after rendering (via setTimeout). This must not lead to separate requests for each table
	// cell resp. console errors due to data access via virtual context.
	// BCP 1770367083
	QUnit.test("sap.ui.table.Table with VisibleRowCountMode='Auto'", function (assert) {
		var sView = '\
<t:Table id="table" rows="{/EMPLOYEES}" visibleRowCountMode="Auto">\
	<t:Column>\
		<t:label>\
			<Label text="Name"/>\
		</t:label>\
		<t:template>\
			<Text id="text" text="{Name}" />\
		</t:template>\
	</t:Column>\
</t:Table>',
			oModel = createTeaBusiModel({autoExpandSelect : true}),
			that = this;

		this.expectChange("text", false); // test listens to changes on table template control
		return this.createView(assert, sView, oModel).then(function () {
			// table.Table must render to call getContexts on its row aggregation's list binding
			that.oView.placeAt("qunit-fixture");
			that.expectRequest("EMPLOYEES?$select=ID,Name&$skip=0&$top=105", {
					"value" : [
						{"Name" : "Frederic Fall"},
						{"Name" : "Jonathan Smith"}
					]
				})
				//TODO The below null's are: Text has binding context null and its initial value is
				// undefined (formatted to null by String type). (How) can we get rid of this?
				.expectChange("text", null, null)
				.expectChange("text", ["Frederic Fall", "Jonathan Smith"]);
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: a ManagedObject instance with a relative object binding (using
	// cross-service navigation) and a property binding (maybe even at the same time)
	// Note: ID will not fail, it is also present on EQUIPMENT! SupplierIdentifier is "unique"
	QUnit.test("Relative object binding & property binding: separate control", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect : true}),
			oText = new Text(),
			sView = '\
<FlexBox binding="{/Equipments(Category=\'Electronics\',ID=1)}">\
	<FlexBox binding="{EQUIPMENT_2_PRODUCT}">\
		<Text id="text" text="{SupplierIdentifier}" />\
	</FlexBox>\
</FlexBox>';

		this.expectRequest("Equipments(Category='Electronics',ID=1)?$select=Category,ID"
			+ "&$expand=EQUIPMENT_2_PRODUCT($select=ID,SupplierIdentifier)", {
			"Category" : "Electronics",
			"ID" : 1,
			"EQUIPMENT_2_PRODUCT" : {
				"ID" : 2, // Edm.Int32
				"SupplierIdentifier" : 42 // Edm.Int32
			}
		})
			// Note: sap.m.Text#text turns value into string!
			.expectChange("text", oText.validateProperty("text", 42))
			.expectChange("text", oText.validateProperty("text", 42)); // TODO unexpected change

		return this.createView(assert, sView, oModel);
	});

	//*********************************************************************************************
	QUnit.test("Relative object binding & property binding: same control", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect : true}),
			oText = new Text(),
			sView = '\
<FlexBox binding="{/Equipments(Category=\'Electronics\',ID=1)}">\
	<Text binding="{EQUIPMENT_2_PRODUCT}" id="text" text="{SupplierIdentifier}" />\
</FlexBox>';

		this.expectRequest("Equipments(Category='Electronics',ID=1)?$select=Category,ID"
			+ "&$expand=EQUIPMENT_2_PRODUCT($select=ID,SupplierIdentifier)", {
			"Category" : "Electronics",
			"ID" : 1,
			"EQUIPMENT_2_PRODUCT" : {
				"ID" : 2, // Edm.Int32
				"SupplierIdentifier" : 42 // Edm.Int32
			}
		})
		// Note: sap.m.Text#text turns value into string!
			.expectChange("text", oText.validateProperty("text", 42))
			.expectChange("text", oText.validateProperty("text", 42)); // TODO unexpected change

		return this.createView(assert, sView, oModel);
	});

	//*********************************************************************************************
	// Scenario: a ManagedObject instance with a relative object binding
	// *using cross-service navigation*
	// and a property binding at the same time, inside a list binding
	// Note: ID will not fail, it is also present on EQUIPMENT! SupplierIdentifier is "unique"
	QUnit.test("Relative object binding & property binding within a list (1)", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect : true}),
			oText = new Text(),
			sView = '\
<Table items="{/Equipments}">\
	<ColumnListItem>\
		<Text binding="{EQUIPMENT_2_PRODUCT}" id="text" text="{SupplierIdentifier}" />\
	</ColumnListItem>\
</Table>';

		this.expectRequest("Equipments?$select=Category,ID&"
			+ "$expand=EQUIPMENT_2_PRODUCT($select=ID,SupplierIdentifier)"
			+ "&$skip=0&$top=100", {value : [{
			"Category" : "Electronics",
			"ID" : 1,
			"EQUIPMENT_2_PRODUCT" : {
				"ID" : 2, // Edm.Int32
				"SupplierIdentifier" : 42 // Edm.Int32
			}
		}]})
			.expectChange("text", oText.validateProperty("text", 42));

		return this.createView(assert, sView, oModel);
	});

	//*********************************************************************************************
	// Scenario: a ManagedObject instance with a relative object binding
	// *w/o cross-service navigation*
	// and a property binding at the same time, inside a list binding
	// Note: ID will not fail, it is also present on EQUIPMENT! AGE is "unique"
	QUnit.test("Relative object binding & property binding within a list (2)", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect : true}),
			oText = new Text(),
			sView = '\
<Table items="{/Equipments}">\
	<ColumnListItem>\
		<Text binding="{EQUIPMENT_2_EMPLOYEE}" id="text" text="{AGE}" />\
	</ColumnListItem>\
</Table>';

		this.expectRequest("Equipments?$select=Category,ID&"
			+ "$expand=EQUIPMENT_2_EMPLOYEE($select=AGE,ID)"
			+ "&$skip=0&$top=100", {value : [{
			"Category" : "Electronics",
			"ID" : 1,
			"EQUIPMENT_2_EMPLOYEE" : {
				"ID" : "0815", // Edm.String
				"AGE" : 42 // Edm.Int16
			}
		}]})
		// Note: change does not appear inside a list binding, it's inside the context binding!
			.expectChange("text", oText.validateProperty("text", 42));

		return this.createView(assert, sView, oModel);
	});

	//*********************************************************************************************
	// Scenario: a ManagedObject instance with a relative object binding (w/o
	// cross-service navigation) and a property binding at the same time, inside a list binding
	// Note: ID will not fail, it is also present on EQUIPMENT! AGE is "unique"
	QUnit.test("Relative object binding & property binding within a list (3)", function (assert) {
		var oText = new Text(),
			sView = '\
<Table items="{/Equipments}">\
	<ColumnListItem>\
		<Text binding="{EQUIPMENT_2_EMPLOYEE}" id="text" text="{AGE}" />\
	</ColumnListItem>\
</Table>';

		this.expectRequest("Equipments?$skip=0&$top=100", {value : [{
			"Category" : "Electronics",
			"ID" : 1,
			"EQUIPMENT_2_EMPLOYEE" : {
				"ID" : "0815", // Edm.String
				"AGE" : 42 // Edm.Int16
			}
		}]})
		// Note: change does not appear inside a list binding, it's inside the context binding!
			.expectChange("text", oText.validateProperty("text", 42));

		return this.createView(assert, sView);
	});

	//*********************************************************************************************
	// Scenario: Object binding provides access to some collection and you then want to filter on
	//   that collection; inspired by https://github.com/SAP/openui5/issues/1763
	QUnit.test("Filter collection provided via object binding", function (assert) {
		var sView = '\
<VBox id="vbox" binding="{parameters : {$expand : \'TEAM_2_EMPLOYEES\'},\
		path : \'/TEAMS(\\\'42\\\')\'}">\
	<Table items="{TEAM_2_EMPLOYEES}">\
		<ColumnListItem>\
			<Text id="id" text="{ID}" />\
		</ColumnListItem>\
	</Table>\
</VBox>',
			that = this;

		// Note: for simplicity, autoExpandSelect : false but still most properties are omitted
		this.expectRequest("TEAMS('42')?$expand=TEAM_2_EMPLOYEES", {
				"TEAM_2_EMPLOYEES" : [{
					"ID" : "1"
				}, {
					"ID" : "2"
				}, {
					"ID" : "3"
				}]
			})
			.expectChange("id", ["1", "2", "3"]);

		return this.createView(assert, sView).then(function () {
			that.expectRequest("TEAMS('42')?$expand=TEAM_2_EMPLOYEES($filter=ID%20eq%20'2')", {
					"TEAM_2_EMPLOYEES" : [{
						"ID" : "2"
					}]
				})
				.expectChange("id", ["2"]);

			that.oView.byId("vbox").getObjectBinding()
				.changeParameters({$expand : "TEAM_2_EMPLOYEES($filter=ID eq '2')"});
		});
	});

	//*********************************************************************************************
	// Scenario: Behaviour of a deferred bound function
	QUnit.test("Bound function", function (assert) {
		var sView = '\
<VBox binding="{/EMPLOYEES(\'1\')}">\
	<VBox id="function" \
		binding="{com.sap.gateway.default.iwbep.tea_busi.v0001.FuGetEmployeeSalaryForecast(...)}">\
		<Text id="status" text="{STATUS}" />\
	</VBox>\
</VBox>',
			that = this;

		this.expectChange("status"); // no event initially
		return this.createView(assert, sView).then(function () {
			that.expectRequest("EMPLOYEES('1')/com.sap.gateway.default.iwbep.tea_busi.v0001"
					+ ".FuGetEmployeeSalaryForecast()",
				{
					"STATUS" : "42"
				})
				.expectChange("status", null) // TODO unexpected change
				.expectChange("status", "42");

			that.oView.byId("function").getObjectBinding().execute();
			return that.waitForChanges(assert);
		});
	});

	//*********************************************************************************************
	// Scenario: Operation binding for a function, first it is deferred, later is has been executed.
	//   Show interaction of setParameter(), execute() and refresh().
	QUnit.test("Function binding: setParameter, execute and refresh", function (assert) {
		var sView = '\
<FlexBox id="function" binding="{/GetEmployeeByID(...)}">\
	<Text id="name" text="{Name}" />\
</FlexBox>',
			that = this;

		this.expectChange("name");
		return this.createView(assert, sView).then(function () {
			var oFunctionBinding = that.oView.byId("function").getObjectBinding();

			oFunctionBinding.refresh(); // MUST NOT trigger a request!

			that.expectRequest("GetEmployeeByID(EmployeeID='1')", {
					"Name" : "Jonathan Smith"
				})
				.expectChange("name", null) // TODO unexpected change
				.expectChange("name", "Jonathan Smith");
			oFunctionBinding.setParameter("EmployeeID", "1").execute();

			return that.waitForChanges(assert).then(function () {
				that.expectRequest("GetEmployeeByID(EmployeeID='1')", {
						"Name" : "Frederic Fall"
					})
					.expectChange("name", "Frederic Fall");
				oFunctionBinding.refresh();

				return that.waitForChanges(assert).then(function () {
					oFunctionBinding.setParameter("EmployeeID", "2");

					oFunctionBinding.refresh(); // MUST NOT trigger a request!

					that.expectRequest("GetEmployeeByID(EmployeeID='2')", {
							"Name" : "Peter Burke"
						})
						.expectChange("name", "Peter Burke");
					oFunctionBinding.execute();

					return that.waitForChanges(assert).then(function () {
						that.expectRequest("GetEmployeeByID(EmployeeID='2')", {
								"Name" : "Jonathan Smith"
							})
							.expectChange("name", "Jonathan Smith");
						oFunctionBinding.refresh();

						return that.waitForChanges(assert);
					});
				});
			});
		});
	});

	//*********************************************************************************************
	// Scenario: Operation binding for a function, first it is deferred, later is has been executed.
	//   Show interaction of setParameter(), execute() and changeParameters().
	QUnit.test("Function binding: setParameter, execute and changeParameters", function (assert) {
		var sView = '\
<FlexBox id="function" binding="{/GetEmployeeByID(...)}">\
	<Text id="name" text="{Name}" />\
</FlexBox>',
			that = this;

		this.expectChange("name");
		return this.createView(assert, sView).then(function () {
			var oFunctionBinding = that.oView.byId("function").getObjectBinding();

			oFunctionBinding.changeParameters({$select : "Name"}); // MUST NOT trigger a request!

			that.expectRequest("GetEmployeeByID(EmployeeID='1')?$select=Name", {
					"Name" : "Jonathan Smith"
				})
				.expectChange("name", null) // TODO unexpected change
				.expectChange("name", "Jonathan Smith");
			oFunctionBinding.setParameter("EmployeeID", "1").execute();

			return that.waitForChanges(assert).then(function () {
				that.expectRequest("GetEmployeeByID(EmployeeID='1')?$select=ID,Name", {
						"Name" : "Frederic Fall"
					})
					.expectChange("name", "Frederic Fall");
				oFunctionBinding.changeParameters({$select : "ID,Name"});

				return that.waitForChanges(assert).then(function () {
					oFunctionBinding.setParameter("EmployeeID", "2");

					// MUST NOT trigger a request!
					oFunctionBinding.changeParameters({$select : "Name"});

					that.expectRequest("GetEmployeeByID(EmployeeID='2')?$select=Name", {
							"Name" : "Peter Burke"
						})
						.expectChange("name", "Peter Burke");
					oFunctionBinding.execute();

					return that.waitForChanges(assert).then(function () {
						that.expectRequest("GetEmployeeByID(EmployeeID='2')?$select=ID,Name", {
								"Name" : "Jonathan Smith"
							})
							.expectChange("name", "Jonathan Smith");
						oFunctionBinding.changeParameters({$select : "ID,Name"});

						return that.waitForChanges(assert);
					});
				});
			});
		});
	});

	//*********************************************************************************************
	// Scenario: ODataListBinding contains ODataContextBinding contains ODataPropertyBinding;
	//   only one cache; refresh()
	QUnit.test("refresh on nested bindings", function (assert) {
		var oModel = createTeaBusiModel({autoExpandSelect : true}),
			sUrl = "TEAMS('42')?$select=Team_Id&$expand=TEAM_2_MANAGER($select=ID)",
			sView = '\
<FlexBox binding="{/TEAMS(\'42\')}">\
	<FlexBox binding="{TEAM_2_MANAGER}">\
		<Text id="id" text="{ID}" />\
	</FlexBox>\
</FlexBox>',
			that = this;

		this.expectRequest(sUrl, {
				"Team_Id" : "42",
				"TEAM_2_MANAGER" : {
					"ID" : "1"
				}
			})
			.expectChange("id", "1") // TODO unexpected change
			.expectChange("id", "1");

		return this.createView(assert, sView, oModel).then(function () {
			that.expectRequest(sUrl, {
					"Team_Id" : "42",
					"TEAM_2_MANAGER" : {
						"ID" : "2"
					}
				})
				.expectChange("id", "2");

			oModel.refresh();

			return that.waitForChanges(assert);
		});
	});
});
//TODO test delete
