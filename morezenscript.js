// ==UserScript==
// @name       More Zen
// @version    0.1.5b
// @description  ZenMiner Cloud Dashboard Augmentation
//
//               Extra features, UI fixes, speed + bandwidth tweaks, and more!
//
//               *** ORGANIZE YOUR MINERS! ***
//               **** REFRESHABLE MARKET! ****
//
//------------------------------------------------------------------------------------------------------------
//
//               ** GENERAL
//               * BTC ticker in navbar
//               * Auto save/load table state
//               * Tables have a refresh button (and F5 hotkey)
//               * Move back/forward between table pages
//               * Fluid tables and charts
//               * Tab/window blur/focus handling
//               * Save/load sidebar state
//               * Sidebar animation fix
//               * Uses sockets wherever possible
// 
//               ** MINERS
//               * Sortable miners, saved in your browser
//               * Miners are closer together and uniformly sized
//               * Pool toolbox accomodates small windows/screens
// 
//               ** MARKET
//               * Smart refreshing
//               * Animated Hashlet ticker
// 
//               ** Activity
//               * Display miner names next to payouts (DEPRECIATED)
//
//------------------------------------------------------------------------------------------------------------
// 
//               Known Issues/TODO List:
//               - Code conflict: Can not drag a miner after dropping it (until refresh)
//               - Core deficiency: Charts are static
//               - Core deficiency: No QR generation offered for deposits
//               - Core deficiency: Lacking site-wide notifications
//               - Core glitch: Browser scrollbar shows in sidebar despite SlimScroll
//               - Deficiency: Owned hash should be displayed somewhere
//               - Deficiency: More things should flash or whatever on update
//               - Deficiency: Non-Hashlets can be dragged around
//               - Deficiency: Lacking cookie storage fallback
//               - Deficiency: JQueryUI Sortable is hacked in as one big minified line
//               - Deficiency: Major organization needed
//               - Laziness: Refresh buttons are barely styled enough to exist at all
//               - Laziness: Research required to comply with Greasemonkey's @grant crap
//               - Quirk: Sometimes can not open 2nd pool dialog until refresh (core issue?)
//               - Quirk: Socket occasionally loses Hashlet ticker requests
//               - Untested: Firefox*/Safari/Opera support
//               - Browser deficiency: IE sucks
//
//------------------------------------------------------------------------------------------------------------
//
//               Changelog:
//               - 0.1.5:    * Miner sorting with persistence
//                           * Tighter miner display
//                           * Added temporary/permanent flag to state factory
//                           * Pool toolbox will try its best to stay in view
//                           * Fixed an NPE sort of condition in the state factory
//                           * Fixed filter state bug
//                           * Fixed ticker flash
//                           * WebKit: Got rid of sidebar scrollbar under normal conditions
//                           * WebKit: Patched up sidebar flicker/disappear (root cause still unknown)
//                           * Performed some FF testing
//                           * Applied permissive license
//                           * Gave the changelog a backstory
//               - 0.1.4:    * Save and load full market state
//                           * Bugfixes and some refactoring
//                           * Some bandwidth optimizations
//                           * Hashlet ticker triggers refresh
//                           * Force Highcharts reflow
//                           * Refresh buttons on all tables
//                           * Hashlet ticker links to filters
//                           * Introduced state factory
//               - 0.1.3:    * Hashlet ticker
//                           * Anchor-enabled pagination
//                           * Save/load sidebar state
//                           * Sidebar animation override/fix
//                           * Use visibility API to track focus
//                           * Some code organization
//                           * Save DataTables' states (no loading yet)
//               - 0.1.2:    * Pause jobs when tab/window not focused
//               - 0.1.1:    * Depreciated "Display miner names on activity page"
//                           * Accepted the impending need for a changelog after several therapy sessions
//
//------------------------------------------------------------------------------------------------------------
//
// @copyright  Copyright 2014 bitstoned [@gmail.com]
//             Licensed under the Apache License, Version 2.0 (the "License");
//             you may not use this file except in compliance with the License.
//             You may obtain a copy of the License at
//
//                 http://www.apache.org/licenses/LICENSE-2.0
//
//             Unless required by applicable law or agreed to in writing, software
//             distributed under the License is distributed on an "AS IS" BASIS,
//             WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//             See the License for the specific language governing permissions and
//             limitations under the License.
//
// @match      https://cloud.zenminer.com/*
// ==/UserScript==

// Quick security check before we proceed
if(location.protocol === 'https:' && location.hostname === parent.location.hostname) $(function() { // FIXME: FF never makes it inside this func when using @grant
    VERSION = GM_info.script.version;
    
    // CLEANUP: This doesn't really have a home... Utils?
    flash = function(e, vv, v) {
        v = $.isNumeric(v) ? v / 1 : 0;
        vv = $.isNumeric(vv) ? vv / 1 : 0;
        0 < vv && (
            (vv < v && (e.parent().css('color', 'green').addClass('pulse'), setTimeout(function() { e.parent().css('color', '').removeClass('pulse'); }, 600))) ||
            (vv > v && (e.parent().css('color', 'red').addClass('pulse'), setTimeout(function() { e.parent().css('color', '').removeClass('pulse'); }, 600)))
        );
    };

    // Just too convenient
    parsePrice = function(s) { return (n = parseFloat(s).toFixed(2)) !== 'NaN' ? n : '0.00'; };
    
    // Clear selected existing event handlers
    $('#toggle-sidebar').off('click'); // Sidebar toggle
    
    // Set up a 10 TPS clock
    $.fn.jobClock = {
        tick: 0,
        clock: function() {
            setInterval(function() {
                $.fn.jobClock.tick = ($.fn.jobClock.tick < 600) ? $.fn.jobClock.tick + 1 : 0;
                var tick = $.fn.jobClock.tick;

                $.fn.jobClock.jobs.forEach(function(j) {
                    if(tick % j.int() === 0) {
                        j.fn();
                    }
                });
            }, 100);
        },
        oneShot: function(j) {
            $.grep($.fn.jobClock.jobs, function(a) {
                return a.name == j;
            })[0].fn();
        },
        jobs: [],
        focused: function() { // Get tab/window focus/"visibility"
            console.log(document.visibilityState == 'visible' || document.hasFocus());
            return document.visibilityState == 'visible' || document.hasFocus();
        }
    };

    unsafeWindow.io && (
        // Add a BTC ticker to the navbar
        $('<li><a href="#" class="btc-spot-price" data-placement="bottom" data-title="Exchange Rate" data-trigger="hover" rel="tooltip"><i class="fa-exchange"></i>&nbsp; $<span>-.--</span></div></a>').prependTo('.navbar-bottom-row'),

        // Update our ticker over a socket
        unsafeWindow.io().on('exchange_rates', function(e) {
            var $e = $('.btc-spot-price span'),
                o = parsePrice($e.text()),
                n = parsePrice(e.btc_to_usd);
            flash($e, o, n);
            $e.text(n);
        })
    );

    sessionStorage && localStorage && (
        sessionStorage.setItem('MoreZenVersion', VERSION),

        // Save our state in sessionStorage
        ($.fn.stateFactory = {
            init: function() {
                this._getOrCreate(!1, !1);
                this._getOrCreate(!0, !1);
                this._getOrCreate(!1, !0);
                this._getOrCreate(!0, !0);
                return true;
            },
            _getName: function(g) {
                return (g && 'uistate' || 'uistate_' + location.pathname.slice(1).split('/')[0]);
            },
            _create: function(g, p) {
                var pgs = {
                        miners: {
                            p: {
                                hashlet_order: []
                            }
                        },
                        market: {
                            p: {
                                // Patch point 994ce01f
                            },
                            t: {
                                filter: null
                            }
                        }
                    },
                    s = (p ? localStorage : sessionStorage),
                    n = this._getName(g),
                    pg = n.split('_')[1],
                    t = p ? 'p' : 't';

                s.setItem(n, JSON.stringify(g && { sidebar: true, scroll: 0 } || (pgs[pg] && pgs[pg][t]) || {}));
                return s.getItem(n);
            },
            _getOrCreate: function(g, p) {
                var stor = (p ? localStorage : sessionStorage);
                return JSON.parse(stor.getItem(this._getName(g)) || this._create(g, p));
            },
            _getState: function(g, p) {
                var stor = (p ? localStorage : sessionStorage);
                return JSON.parse(stor.getItem(this._getName(g)));
            },
            _setState: function(g, o, p) {
                var stor = (p ? localStorage : sessionStorage);
                return stor.setItem(this._getName(g), JSON.stringify(o));
            },
            getState: function(g, k, p) {
                return k ? this._getState(g, p)[k] : this._getState(g);
            },
            setState: function(g, k, v, p) {
                _state = this._getState(g, p);
                _state[k] = v;
                return this._setState(g, _state, p);
            },
            toggleState: function(g, k, p) {
                if(!typeof g) g = 1;
                this.setState(g, k, this.getState(g, k) ? false : true, p);
            }
        }).init()
    ) || (
        // Bandwidth-heavy cookie fallback
        console.log('TODO: Y U NO WEB 2.0?')
    );

    // Save/restore global state
    $.fn.stateFactory && (
        // Remember sidebar state
        $('#toggle-sidebar').on('click', function(e) {
            // Only toggle on human trigger
            e.originalEvent && $.fn.stateFactory.toggleState(!0, 'sidebar');
        }),

        // Load saved UI state
        $.fn.stateFactory.getState(!0, 'sidebar') || (
            setTimeout(function() {
                $('#toggle-sidebar').trigger('click');
            }, 1500)
        )
    );

    window.Highcharts && (
        console.log('TODO: redraw charts a la refresh()')
    );

    // Scripts for pages with DataTables
    $.fn.dataTableSettings[0] && (
        // Trigger a DataTable refresh
        refresh = function() {
            $(".pagination li.active a").trigger('click');
        },
        unsafeWindow.refresh = refresh,

        // Refresh button above all tables
        $('.panel-controls').length || $('.dataTables_wrapper').parent().append('<div class="panel-controls">'),
        $('.panel-controls').prepend('<button class="btn btn-xs" style="margin-right: 8px;" onClick="javascript: refresh();"><i class="fa-refresh fa-sm"></i></button>'),

        // F5 to refresh() (Does not trap Ctrl-F5 or Shift-F5)
        $(document).on("keydown", function(e) { if (!e.ctrlKey && !e.shiftKey && (e.which || e.keyCode) == 116) { e.preventDefault(); refresh(); } }),

        // Alter history on page change
        $.fn.dataTableSettings[0].aoDrawCallback.push({
            fn: function() {
                p = $.fn.dataTableSettings[0]._iDisplayStart / $.fn.dataTableSettings[0]._iDisplayLength + 1;
                p == (location.hash || 1) || history.pushState({}, '', '#' + p);
            },
            sName: 'Page history'
        }),

        // Inter-page navigation
        $(window).on('popstate', function(e) {
            $('.pagination li a:contains("' + (location.hash || 1) + '")').trigger('click');
        }),

        // Remember market sort/display state
        $.fn.dataTableSettings[0].aoDrawCallback.push({
            fn: function(dts) {
                var fire = function(dts, cbs, e, o) {
                    var ret = [];
                    cbs && (ret = $.map(dts[cbs].slice().reverse(), function(b) { return b.fn.apply(dts.oInstance, o); } ));
                    null !== e && $(dts.nTable).trigger(e + ".dt", o);
                    return ret;
                };

                if(dts.iDraw > 1 && !dts.bDestroying) {
                    var state = {
                        time: +new Date,
                        start: dts._iDisplayStart,
                        length: dts._iDisplayLength,
                        order: $.extend(!0, [], dts.aaSorting),
                        search: {}, //zb(a.oPreviousSearch),
                        columns: $.map(dts.aoColumns, function(col, i) { return { visible: col.bVisible, search: {} /*zb(dts.aoPreSearchCols[i])*/ }; })
                    };

                    fire(dts, "aoStateSaveParams", "stateSaveParams", [dts, state]);

                    dts.oSavedState = state;
                    dts.fnStateSaveCallback.call(dts.oInstance, dts, state)
                };
            },
            sName: 'State Save'
        }),

        // Load
        $.fn.dataTableSettings[0].aoInitComplete.push({
            fn: function(dts) {
                // ripped from DT src

                var fire = function(dts, cbs, e, o) {
                    var ret = [];
                    cbs && (ret = $.map(dts[cbs].slice().reverse(), function(b) { return b.fn.apply(dts.oInstance, o); } ));
                    null !== e && $(dts.nTable).trigger(e + ".dt", o);
                    return ret;
                };

                var b, c, cols = dts.aoColumns;
                var state = dts.fnStateLoadCallback.call(dts.oInstance, dts);

                if (state && state.time && (
                    e = fire(dts, "aoStateLoadParams", "stateLoadParams", [dts, state]),
                    -1 === $.inArray(!1, e) && (e = dts.iStateDuration, !(0 < e && state.time < +new Date - 1E3 * e) && cols.length === state.columns.length)
                )) {
                    dts.oLoadedState = $.extend(!0, {}, state);
                    dts._iDisplayStart = state.start;
                    dts.iInitDisplayStart = state.start;
                    dts._iDisplayLength = state.length;
                    dts.aaSorting = [];

                    $.each(state.order, function(x, col) {
                        dts.aaSorting.push(col[0] >= cols.length ? [0, col[1]] : col)
                    });

                    fire(dts, "aoStateLoaded", "stateLoaded", [dts, state]);
                };

                dts.oApi._fnReDraw(dts);
                // Pull our data at the end of the tick
                setTimeout(function() { dts.oApi._fnAjaxUpdate(dts); }, 0);
            },
            sName: 'State Load'
        })
    );

    // Patch point f622ce1a

    // Page-specific scripts
    switch(location.pathname.slice(1).split('/')[0]) {

        // Market scripts
        case 'market':
            // Apply saved filter before table reinit
            $.fn.dataTableSettings[0].aoInitComplete.push({
                fn: function(dts) {
                    dts._iDisplayLength = 15; // Speedhack: only request 15 records per page
                    $('.filterbox a').filter(function(i, e) {
                        return e.dataset.value == $.fn.stateFactory.getState(!1, 'filter');
                    }).parent().addClass('active');
                },
                sName: 'Filter injection'
            });
            
            $('.filterbox button').on('click', function(e) {
                $.fn.stateFactory.setState(!1, 'filter', null);
            });
            
            $('.filterbox a').on('click', function(e) {
                $.fn.stateFactory.setState(!1, 'filter', this.dataset.value);
            });
            
            $('<div/>', {
                class: 'market-ticker',
                css: {
                    marginTop: '-58px',
                    float: 'right'
                },
                html: function() {
                    var hashlet_types = [
                            ['hashlet-genesis', 'Hashlet Genesis', 'genesis-price'],
                            ['multihashlet', 'MultiHashlet', 'multi-price'],
                            ['cleverhashlet', 'CleverHashlet', 'clever-price'],
                            ['wafflehashlet', 'WaffleHashlet', 'waffle-price'],
                            ['zenhashlet', 'ZenHashlet', 'zen-price'],
                            ['hashlet-prime', 'Hashlet Prime', 'prime-price'],
                            ['legendary-hashlet hashlet-prime', 'Legendary Hashlet', 'legendary-price'],
                            ['vegas_hashlet hashlet-prime', 'Vegas Hashlet', 'vegas-price'],
                            ['rip-hashlet hashlet-prime', 'RIP Hashlet', 'rip-price'],
                            ['haaashlet-hashlet hashlet-prime', 'Haaashlet Hashlet', 'haaashlet-price'],
                            ['haunted-hashlet hashlet-prime', 'Haunted Hashlet', 'haunted-price']
                        ],
                        out = '';
                    $(hashlet_types).each(function(i, a) {
                        /*jshint multistr: true */
                        out += '<span style="display: inline-block; padding-left: 8px; text-align: center;" class="hashlet-ticker-item animated">\
                                    <a href="#" onClick="javascript: $($(\'.filterbox li a\')[' + i + ']).trigger(\'click\')">\
                                        <i class="hashlet-icon ' + a[0] + '" style="display: block; margin: auto; width: 36px; height: 36px; padding-bottom: 3px; border-radius: 6px;" rel="tooltip" data-trigger="hover" data-placement="bottom" data-title="' + a[1] + '"></i>\
                                    </a>\
                                    $<span class="' + a[2] + '">-.--</span>\
                                </span>';
                        /*jshint multistr: false */
                    });
                    return out;
                }
            }).appendTo('#content .heading');
            $('.hashlet-ticker-item a i').tooltip();

            // Patch point 0c443b1d

            // Market ticker
            $.fn.jobClock.jobs.push({
                fn: function() {
                    var hashlet_types = [
                        ['5426754e5067c07426328631', 'genesis'],
                        ['5426754e5067c07426328632', 'multi'],
                        ['5426754e5067c07426328633', 'clever'],
                        ['5426754e5067c07426328634', 'waffle'],
                        ['5426754e5067c07426328635', 'zen'],
                        ['5426754e5067c07426328636', 'prime'],
                        ['5426754e5067c07426328637', 'legendary'],
                        ['543cae019ab09fce22e48d69', 'vegas'],
                        ['544a8f855417787106609519', 'rip'],
                        ['544a8f85541778710660951a', 'haaashlet'],
                        ['544a8f85541778710660951b', 'haunted']
                    ];
                    
                    $.fn.jobClock.focused() && (
                        $(hashlet_types).each(function(i, a) { // Seems to be no way to ask for multiple prices at once :(
                            unsafeWindow.io().emit('zenmarket:hashlets:price', a[0],
                                function(x, t) {
                                    var $e = $('.market-ticker .' + a[1] + '-price'),
                                        o = parsePrice($e.text()),
                                        n = parsePrice(t);
                                    flash($e, o, n);
                                    $e.text(n);
                                    o == n || refresh();
                                }
                            );
                        })
                    );
                },
                int: function() { return 150; },
                name: 'marketTicker'
            });
            $.fn.jobClock.oneShot('marketTicker');

            // Patch point 77ce11d0

            break;

        // Activity feed scripts
        case 'activity':
            // Render miner names in table (DEPRECIATED)
            $.fn.dataTableSettings[0].aoDrawCallback.push({
                    fn: function() {
                            $('#DataTables_Table_0 > tbody > tr > td > .details .btn-payout-detail').each(function(i, el) {
                                    var id = $(el).data("transaction");
                                    id && $.getJSON("/api/payout-detail/" + id, function(e) { $(el).after(' ' + e.name); });
                            });
                    },
                    sName: ''
            });
            break;

        // Dashboard scripts
        case 'dashboard':
            $.fn.jobClock.jobs.push({
                fn: function() { $.each(unsafeWindow.Highcharts.charts, function(i, o) { $(o.container).width() == $(o.container).parent().width() || o.reflow(); }); },
                int: function() { return 3; }
            });
            break;

        // Miner page scripts
        case 'miners':
            setTimeout(function() {
                // JQueryUI Sortable module as a widget
                var e = $;
                function t(e,t,i){return e>t&&t+i>e}function i(e){return/left|right/.test(e.css("float"))||/inline|table-cell/.test(e.css("display"))}e.widget("ui.sortable",e.ui.mouse,{version:"1.10.4",widgetEventPrefix:"sort",ready:!1,options:{appendTo:"parent",axis:!1,connectWith:!1,containment:!1,cursor:"auto",cursorAt:!1,dropOnEmpty:!0,forcePlaceholderSize:!1,forceHelperSize:!1,grid:!1,handle:!1,helper:"original",items:"> *",opacity:!1,placeholder:!1,revert:!1,scroll:!0,scrollSensitivity:20,scrollSpeed:20,scope:"default",tolerance:"intersect",zIndex:1e3,activate:null,beforeStop:null,change:null,deactivate:null,out:null,over:null,receive:null,remove:null,sort:null,start:null,stop:null,update:null},_create:function(){var e=this.options;this.containerCache={},this.element.addClass("ui-sortable"),this.refresh(),this.floating=this.items.length?"x"===e.axis||i(this.items[0].item):!1,this.offset=this.element.offset(),this._mouseInit(),this.ready=!0},_destroy:function(){this.element.removeClass("ui-sortable ui-sortable-disabled"),this._mouseDestroy();for(var e=this.items.length-1;e>=0;e--)this.items[e].item.removeData(this.widgetName+"-item");return this},_setOption:function(t,i){"disabled"===t?(this.options[t]=i,this.widget().toggleClass("ui-sortable-disabled",!!i)):e.Widget.prototype._setOption.apply(this,arguments)},_mouseCapture:function(t,i){var s=null,a=!1,n=this;return this.reverting?!1:this.options.disabled||"static"===this.options.type?!1:(this._refreshItems(t),e(t.target).parents().each(function(){return e.data(this,n.widgetName+"-item")===n?(s=e(this),!1):undefined}),e.data(t.target,n.widgetName+"-item")===n&&(s=e(t.target)),s?!this.options.handle||i||(e(this.options.handle,s).find("*").addBack().each(function(){this===t.target&&(a=!0)}),a)?(this.currentItem=s,this._removeCurrentsFromItems(),!0):!1:!1)},_mouseStart:function(t,i,s){var a,n,r=this.options;if(this.currentContainer=this,this.refreshPositions(),this.helper=this._createHelper(t),this._cacheHelperProportions(),this._cacheMargins(),this.scrollParent=this.helper.scrollParent(),this.offset=this.currentItem.offset(),this.offset={top:this.offset.top-this.margins.top,left:this.offset.left-this.margins.left},e.extend(this.offset,{click:{left:t.pageX-this.offset.left,top:t.pageY-this.offset.top},parent:this._getParentOffset(),relative:this._getRelativeOffset()}),this.helper.css("position","absolute"),this.cssPosition=this.helper.css("position"),this.originalPosition=this._generatePosition(t),this.originalPageX=t.pageX,this.originalPageY=t.pageY,r.cursorAt&&this._adjustOffsetFromHelper(r.cursorAt),this.domPosition={prev:this.currentItem.prev()[0],parent:this.currentItem.parent()[0]},this.helper[0]!==this.currentItem[0]&&this.currentItem.hide(),this._createPlaceholder(),r.containment&&this._setContainment(),r.cursor&&"auto"!==r.cursor&&(n=this.document.find("body"),this.storedCursor=n.css("cursor"),n.css("cursor",r.cursor),this.storedStylesheet=e("<style>*{ cursor: "+r.cursor+" !important; }</style>").appendTo(n)),r.opacity&&(this.helper.css("opacity")&&(this._storedOpacity=this.helper.css("opacity")),this.helper.css("opacity",r.opacity)),r.zIndex&&(this.helper.css("zIndex")&&(this._storedZIndex=this.helper.css("zIndex")),this.helper.css("zIndex",r.zIndex)),this.scrollParent[0]!==document&&"HTML"!==this.scrollParent[0].tagName&&(this.overflowOffset=this.scrollParent.offset()),this._trigger("start",t,this._uiHash()),this._preserveHelperProportions||this._cacheHelperProportions(),!s)for(a=this.containers.length-1;a>=0;a--)this.containers[a]._trigger("activate",t,this._uiHash(this));return e.ui.ddmanager&&(e.ui.ddmanager.current=this),e.ui.ddmanager&&!r.dropBehaviour&&e.ui.ddmanager.prepareOffsets(this,t),this.dragging=!0,this.helper.addClass("ui-sortable-helper"),this._mouseDrag(t),!0},_mouseDrag:function(t){var i,s,a,n,r=this.options,o=!1;for(this.position=this._generatePosition(t),this.positionAbs=this._convertPositionTo("absolute"),this.lastPositionAbs||(this.lastPositionAbs=this.positionAbs),this.options.scroll&&(this.scrollParent[0]!==document&&"HTML"!==this.scrollParent[0].tagName?(this.overflowOffset.top+this.scrollParent[0].offsetHeight-t.pageY<r.scrollSensitivity?this.scrollParent[0].scrollTop=o=this.scrollParent[0].scrollTop+r.scrollSpeed:t.pageY-this.overflowOffset.top<r.scrollSensitivity&&(this.scrollParent[0].scrollTop=o=this.scrollParent[0].scrollTop-r.scrollSpeed),this.overflowOffset.left+this.scrollParent[0].offsetWidth-t.pageX<r.scrollSensitivity?this.scrollParent[0].scrollLeft=o=this.scrollParent[0].scrollLeft+r.scrollSpeed:t.pageX-this.overflowOffset.left<r.scrollSensitivity&&(this.scrollParent[0].scrollLeft=o=this.scrollParent[0].scrollLeft-r.scrollSpeed)):(t.pageY-e(document).scrollTop()<r.scrollSensitivity?o=e(document).scrollTop(e(document).scrollTop()-r.scrollSpeed):e(window).height()-(t.pageY-e(document).scrollTop())<r.scrollSensitivity&&(o=e(document).scrollTop(e(document).scrollTop()+r.scrollSpeed)),t.pageX-e(document).scrollLeft()<r.scrollSensitivity?o=e(document).scrollLeft(e(document).scrollLeft()-r.scrollSpeed):e(window).width()-(t.pageX-e(document).scrollLeft())<r.scrollSensitivity&&(o=e(document).scrollLeft(e(document).scrollLeft()+r.scrollSpeed))),o!==!1&&e.ui.ddmanager&&!r.dropBehaviour&&e.ui.ddmanager.prepareOffsets(this,t)),this.positionAbs=this._convertPositionTo("absolute"),this.options.axis&&"y"===this.options.axis||(this.helper[0].style.left=this.position.left+"px"),this.options.axis&&"x"===this.options.axis||(this.helper[0].style.top=this.position.top+"px"),i=this.items.length-1;i>=0;i--)if(s=this.items[i],a=s.item[0],n=this._intersectsWithPointer(s),n&&s.instance===this.currentContainer&&a!==this.currentItem[0]&&this.placeholder[1===n?"next":"prev"]()[0]!==a&&!e.contains(this.placeholder[0],a)&&("semi-dynamic"===this.options.type?!e.contains(this.element[0],a):!0)){if(this.direction=1===n?"down":"up","pointer"!==this.options.tolerance&&!this._intersectsWithSides(s))break;this._rearrange(t,s),this._trigger("change",t,this._uiHash());break}return this._contactContainers(t),e.ui.ddmanager&&e.ui.ddmanager.drag(this,t),this._trigger("sort",t,this._uiHash()),this.lastPositionAbs=this.positionAbs,!1},_mouseStop:function(t,i){if(t){if(e.ui.ddmanager&&!this.options.dropBehaviour&&e.ui.ddmanager.drop(this,t),this.options.revert){var s=this,a=this.placeholder.offset(),n=this.options.axis,r={};n&&"x"!==n||(r.left=a.left-this.offset.parent.left-this.margins.left+(this.offsetParent[0]===document.body?0:this.offsetParent[0].scrollLeft)),n&&"y"!==n||(r.top=a.top-this.offset.parent.top-this.margins.top+(this.offsetParent[0]===document.body?0:this.offsetParent[0].scrollTop)),this.reverting=!0,e(this.helper).animate(r,parseInt(this.options.revert,10)||500,function(){s._clear(t)})}else this._clear(t,i);return!1}},cancel:function(){if(this.dragging){this._mouseUp({target:null}),"original"===this.options.helper?this.currentItem.css(this._storedCSS).removeClass("ui-sortable-helper"):this.currentItem.show();for(var t=this.containers.length-1;t>=0;t--)this.containers[t]._trigger("deactivate",null,this._uiHash(this)),this.containers[t].containerCache.over&&(this.containers[t]._trigger("out",null,this._uiHash(this)),this.containers[t].containerCache.over=0)}return this.placeholder&&(this.placeholder[0].parentNode&&this.placeholder[0].parentNode.removeChild(this.placeholder[0]),"original"!==this.options.helper&&this.helper&&this.helper[0].parentNode&&this.helper.remove(),e.extend(this,{helper:null,dragging:!1,reverting:!1,_noFinalSort:null}),this.domPosition.prev?e(this.domPosition.prev).after(this.currentItem):e(this.domPosition.parent).prepend(this.currentItem)),this},serialize:function(t){var i=this._getItemsAsjQuery(t&&t.connected),s=[];return t=t||{},e(i).each(function(){var i=(e(t.item||this).attr(t.attribute||"id")||"").match(t.expression||/(.+)[\-=_](.+)/);i&&s.push((t.key||i[1]+"[]")+"="+(t.key&&t.expression?i[1]:i[2]))}),!s.length&&t.key&&s.push(t.key+"="),s.join("&")},toArray:function(t){var i=this._getItemsAsjQuery(t&&t.connected),s=[];return t=t||{},i.each(function(){s.push(e(t.item||this).attr(t.attribute||"id")||"")}),s},_intersectsWith:function(e){var t=this.positionAbs.left,i=t+this.helperProportions.width,s=this.positionAbs.top,a=s+this.helperProportions.height,n=e.left,r=n+e.width,o=e.top,h=o+e.height,l=this.offset.click.top,u=this.offset.click.left,d="x"===this.options.axis||s+l>o&&h>s+l,c="y"===this.options.axis||t+u>n&&r>t+u,p=d&&c;return"pointer"===this.options.tolerance||this.options.forcePointerForContainers||"pointer"!==this.options.tolerance&&this.helperProportions[this.floating?"width":"height"]>e[this.floating?"width":"height"]?p:t+this.helperProportions.width/2>n&&r>i-this.helperProportions.width/2&&s+this.helperProportions.height/2>o&&h>a-this.helperProportions.height/2},_intersectsWithPointer:function(e){var i="x"===this.options.axis||t(this.positionAbs.top+this.offset.click.top,e.top,e.height),s="y"===this.options.axis||t(this.positionAbs.left+this.offset.click.left,e.left,e.width),a=i&&s,n=this._getDragVerticalDirection(),r=this._getDragHorizontalDirection();return a?this.floating?r&&"right"===r||"down"===n?2:1:n&&("down"===n?2:1):!1},_intersectsWithSides:function(e){var i=t(this.positionAbs.top+this.offset.click.top,e.top+e.height/2,e.height),s=t(this.positionAbs.left+this.offset.click.left,e.left+e.width/2,e.width),a=this._getDragVerticalDirection(),n=this._getDragHorizontalDirection();return this.floating&&n?"right"===n&&s||"left"===n&&!s:a&&("down"===a&&i||"up"===a&&!i)},_getDragVerticalDirection:function(){var e=this.positionAbs.top-this.lastPositionAbs.top;return 0!==e&&(e>0?"down":"up")},_getDragHorizontalDirection:function(){var e=this.positionAbs.left-this.lastPositionAbs.left;return 0!==e&&(e>0?"right":"left")},refresh:function(e){return this._refreshItems(e),this.refreshPositions(),this},_connectWith:function(){var e=this.options;return e.connectWith.constructor===String?[e.connectWith]:e.connectWith},_getItemsAsjQuery:function(t){function i(){o.push(this)}var s,a,n,r,o=[],h=[],l=this._connectWith();if(l&&t)for(s=l.length-1;s>=0;s--)for(n=e(l[s]),a=n.length-1;a>=0;a--)r=e.data(n[a],this.widgetFullName),r&&r!==this&&!r.options.disabled&&h.push([e.isFunction(r.options.items)?r.options.items.call(r.element):e(r.options.items,r.element).not(".ui-sortable-helper").not(".ui-sortable-placeholder"),r]);for(h.push([e.isFunction(this.options.items)?this.options.items.call(this.element,null,{options:this.options,item:this.currentItem}):e(this.options.items,this.element).not(".ui-sortable-helper").not(".ui-sortable-placeholder"),this]),s=h.length-1;s>=0;s--)h[s][0].each(i);return e(o)},_removeCurrentsFromItems:function(){var t=this.currentItem.find(":data("+this.widgetName+"-item)");this.items=e.grep(this.items,function(e){for(var i=0;t.length>i;i++)if(t[i]===e.item[0])return!1;return!0})},_refreshItems:function(t){this.items=[],this.containers=[this];var i,s,a,n,r,o,h,l,u=this.items,d=[[e.isFunction(this.options.items)?this.options.items.call(this.element[0],t,{item:this.currentItem}):e(this.options.items,this.element),this]],c=this._connectWith();if(c&&this.ready)for(i=c.length-1;i>=0;i--)for(a=e(c[i]),s=a.length-1;s>=0;s--)n=e.data(a[s],this.widgetFullName),n&&n!==this&&!n.options.disabled&&(d.push([e.isFunction(n.options.items)?n.options.items.call(n.element[0],t,{item:this.currentItem}):e(n.options.items,n.element),n]),this.containers.push(n));for(i=d.length-1;i>=0;i--)for(r=d[i][1],o=d[i][0],s=0,l=o.length;l>s;s++)h=e(o[s]),h.data(this.widgetName+"-item",r),u.push({item:h,instance:r,width:0,height:0,left:0,top:0})},refreshPositions:function(t){this.offsetParent&&this.helper&&(this.offset.parent=this._getParentOffset());var i,s,a,n;for(i=this.items.length-1;i>=0;i--)s=this.items[i],s.instance!==this.currentContainer&&this.currentContainer&&s.item[0]!==this.currentItem[0]||(a=this.options.toleranceElement?e(this.options.toleranceElement,s.item):s.item,t||(s.width=a.outerWidth(),s.height=a.outerHeight()),n=a.offset(),s.left=n.left,s.top=n.top);if(this.options.custom&&this.options.custom.refreshContainers)this.options.custom.refreshContainers.call(this);else for(i=this.containers.length-1;i>=0;i--)n=this.containers[i].element.offset(),this.containers[i].containerCache.left=n.left,this.containers[i].containerCache.top=n.top,this.containers[i].containerCache.width=this.containers[i].element.outerWidth(),this.containers[i].containerCache.height=this.containers[i].element.outerHeight();return this},_createPlaceholder:function(t){t=t||this;var i,s=t.options;s.placeholder&&s.placeholder.constructor!==String||(i=s.placeholder,s.placeholder={element:function(){var s=t.currentItem[0].nodeName.toLowerCase(),a=e("<"+s+">",t.document[0]).addClass(i||t.currentItem[0].className+" ui-sortable-placeholder").removeClass("ui-sortable-helper");return"tr"===s?t.currentItem.children().each(function(){e("<td>&#160;</td>",t.document[0]).attr("colspan",e(this).attr("colspan")||1).appendTo(a)}):"img"===s&&a.attr("src",t.currentItem.attr("src")),i||a.css("visibility","hidden"),a},update:function(e,a){(!i||s.forcePlaceholderSize)&&(a.height()||a.height(t.currentItem.innerHeight()-parseInt(t.currentItem.css("paddingTop")||0,10)-parseInt(t.currentItem.css("paddingBottom")||0,10)),a.width()||a.width(t.currentItem.innerWidth()-parseInt(t.currentItem.css("paddingLeft")||0,10)-parseInt(t.currentItem.css("paddingRight")||0,10)))}}),t.placeholder=e(s.placeholder.element.call(t.element,t.currentItem)),t.currentItem.after(t.placeholder),s.placeholder.update(t,t.placeholder)},_contactContainers:function(s){var a,n,r,o,h,l,u,d,c,p,f=null,m=null;for(a=this.containers.length-1;a>=0;a--)if(!e.contains(this.currentItem[0],this.containers[a].element[0]))if(this._intersectsWith(this.containers[a].containerCache)){if(f&&e.contains(this.containers[a].element[0],f.element[0]))continue;f=this.containers[a],m=a}else this.containers[a].containerCache.over&&(this.containers[a]._trigger("out",s,this._uiHash(this)),this.containers[a].containerCache.over=0);if(f)if(1===this.containers.length)this.containers[m].containerCache.over||(this.containers[m]._trigger("over",s,this._uiHash(this)),this.containers[m].containerCache.over=1);else{for(r=1e4,o=null,p=f.floating||i(this.currentItem),h=p?"left":"top",l=p?"width":"height",u=this.positionAbs[h]+this.offset.click[h],n=this.items.length-1;n>=0;n--)e.contains(this.containers[m].element[0],this.items[n].item[0])&&this.items[n].item[0]!==this.currentItem[0]&&(!p||t(this.positionAbs.top+this.offset.click.top,this.items[n].top,this.items[n].height))&&(d=this.items[n].item.offset()[h],c=!1,Math.abs(d-u)>Math.abs(d+this.items[n][l]-u)&&(c=!0,d+=this.items[n][l]),r>Math.abs(d-u)&&(r=Math.abs(d-u),o=this.items[n],this.direction=c?"up":"down"));if(!o&&!this.options.dropOnEmpty)return;if(this.currentContainer===this.containers[m])return;o?this._rearrange(s,o,null,!0):this._rearrange(s,null,this.containers[m].element,!0),this._trigger("change",s,this._uiHash()),this.containers[m]._trigger("change",s,this._uiHash(this)),this.currentContainer=this.containers[m],this.options.placeholder.update(this.currentContainer,this.placeholder),this.containers[m]._trigger("over",s,this._uiHash(this)),this.containers[m].containerCache.over=1}},_createHelper:function(t){var i=this.options,s=e.isFunction(i.helper)?e(i.helper.apply(this.element[0],[t,this.currentItem])):"clone"===i.helper?this.currentItem.clone():this.currentItem;return s.parents("body").length||e("parent"!==i.appendTo?i.appendTo:this.currentItem[0].parentNode)[0].appendChild(s[0]),s[0]===this.currentItem[0]&&(this._storedCSS={width:this.currentItem[0].style.width,height:this.currentItem[0].style.height,position:this.currentItem.css("position"),top:this.currentItem.css("top"),left:this.currentItem.css("left")}),(!s[0].style.width||i.forceHelperSize)&&s.width(this.currentItem.width()),(!s[0].style.height||i.forceHelperSize)&&s.height(this.currentItem.height()),s},_adjustOffsetFromHelper:function(t){"string"==typeof t&&(t=t.split(" ")),e.isArray(t)&&(t={left:+t[0],top:+t[1]||0}),"left"in t&&(this.offset.click.left=t.left+this.margins.left),"right"in t&&(this.offset.click.left=this.helperProportions.width-t.right+this.margins.left),"top"in t&&(this.offset.click.top=t.top+this.margins.top),"bottom"in t&&(this.offset.click.top=this.helperProportions.height-t.bottom+this.margins.top)},_getParentOffset:function(){this.offsetParent=this.helper.offsetParent();var t=this.offsetParent.offset();return"absolute"===this.cssPosition&&this.scrollParent[0]!==document&&e.contains(this.scrollParent[0],this.offsetParent[0])&&(t.left+=this.scrollParent.scrollLeft(),t.top+=this.scrollParent.scrollTop()),(this.offsetParent[0]===document.body||this.offsetParent[0].tagName&&"html"===this.offsetParent[0].tagName.toLowerCase()&&e.ui.ie)&&(t={top:0,left:0}),{top:t.top+(parseInt(this.offsetParent.css("borderTopWidth"),10)||0),left:t.left+(parseInt(this.offsetParent.css("borderLeftWidth"),10)||0)}},_getRelativeOffset:function(){if("relative"===this.cssPosition){var e=this.currentItem.position();return{top:e.top-(parseInt(this.helper.css("top"),10)||0)+this.scrollParent.scrollTop(),left:e.left-(parseInt(this.helper.css("left"),10)||0)+this.scrollParent.scrollLeft()}}return{top:0,left:0}},_cacheMargins:function(){this.margins={left:parseInt(this.currentItem.css("marginLeft"),10)||0,top:parseInt(this.currentItem.css("marginTop"),10)||0}},_cacheHelperProportions:function(){this.helperProportions={width:this.helper.outerWidth(),height:this.helper.outerHeight()}},_setContainment:function(){var t,i,s,a=this.options;"parent"===a.containment&&(a.containment=this.helper[0].parentNode),("document"===a.containment||"window"===a.containment)&&(this.containment=[0-this.offset.relative.left-this.offset.parent.left,0-this.offset.relative.top-this.offset.parent.top,e("document"===a.containment?document:window).width()-this.helperProportions.width-this.margins.left,(e("document"===a.containment?document:window).height()||document.body.parentNode.scrollHeight)-this.helperProportions.height-this.margins.top]),/^(document|window|parent)$/.test(a.containment)||(t=e(a.containment)[0],i=e(a.containment).offset(),s="hidden"!==e(t).css("overflow"),this.containment=[i.left+(parseInt(e(t).css("borderLeftWidth"),10)||0)+(parseInt(e(t).css("paddingLeft"),10)||0)-this.margins.left,i.top+(parseInt(e(t).css("borderTopWidth"),10)||0)+(parseInt(e(t).css("paddingTop"),10)||0)-this.margins.top,i.left+(s?Math.max(t.scrollWidth,t.offsetWidth):t.offsetWidth)-(parseInt(e(t).css("borderLeftWidth"),10)||0)-(parseInt(e(t).css("paddingRight"),10)||0)-this.helperProportions.width-this.margins.left,i.top+(s?Math.max(t.scrollHeight,t.offsetHeight):t.offsetHeight)-(parseInt(e(t).css("borderTopWidth"),10)||0)-(parseInt(e(t).css("paddingBottom"),10)||0)-this.helperProportions.height-this.margins.top])},_convertPositionTo:function(t,i){i||(i=this.position);var s="absolute"===t?1:-1,a="absolute"!==this.cssPosition||this.scrollParent[0]!==document&&e.contains(this.scrollParent[0],this.offsetParent[0])?this.scrollParent:this.offsetParent,n=/(html|body)/i.test(a[0].tagName);return{top:i.top+this.offset.relative.top*s+this.offset.parent.top*s-("fixed"===this.cssPosition?-this.scrollParent.scrollTop():n?0:a.scrollTop())*s,left:i.left+this.offset.relative.left*s+this.offset.parent.left*s-("fixed"===this.cssPosition?-this.scrollParent.scrollLeft():n?0:a.scrollLeft())*s}},_generatePosition:function(t){var i,s,a=this.options,n=t.pageX,r=t.pageY,o="absolute"!==this.cssPosition||this.scrollParent[0]!==document&&e.contains(this.scrollParent[0],this.offsetParent[0])?this.scrollParent:this.offsetParent,h=/(html|body)/i.test(o[0].tagName);return"relative"!==this.cssPosition||this.scrollParent[0]!==document&&this.scrollParent[0]!==this.offsetParent[0]||(this.offset.relative=this._getRelativeOffset()),this.originalPosition&&(this.containment&&(t.pageX-this.offset.click.left<this.containment[0]&&(n=this.containment[0]+this.offset.click.left),t.pageY-this.offset.click.top<this.containment[1]&&(r=this.containment[1]+this.offset.click.top),t.pageX-this.offset.click.left>this.containment[2]&&(n=this.containment[2]+this.offset.click.left),t.pageY-this.offset.click.top>this.containment[3]&&(r=this.containment[3]+this.offset.click.top)),a.grid&&(i=this.originalPageY+Math.round((r-this.originalPageY)/a.grid[1])*a.grid[1],r=this.containment?i-this.offset.click.top>=this.containment[1]&&i-this.offset.click.top<=this.containment[3]?i:i-this.offset.click.top>=this.containment[1]?i-a.grid[1]:i+a.grid[1]:i,s=this.originalPageX+Math.round((n-this.originalPageX)/a.grid[0])*a.grid[0],n=this.containment?s-this.offset.click.left>=this.containment[0]&&s-this.offset.click.left<=this.containment[2]?s:s-this.offset.click.left>=this.containment[0]?s-a.grid[0]:s+a.grid[0]:s)),{top:r-this.offset.click.top-this.offset.relative.top-this.offset.parent.top+("fixed"===this.cssPosition?-this.scrollParent.scrollTop():h?0:o.scrollTop()),left:n-this.offset.click.left-this.offset.relative.left-this.offset.parent.left+("fixed"===this.cssPosition?-this.scrollParent.scrollLeft():h?0:o.scrollLeft())}},_rearrange:function(e,t,i,s){i?i[0].appendChild(this.placeholder[0]):t.item[0].parentNode.insertBefore(this.placeholder[0],"down"===this.direction?t.item[0]:t.item[0].nextSibling),this.counter=this.counter?++this.counter:1;var a=this.counter;this._delay(function(){a===this.counter&&this.refreshPositions(!s)})},_clear:function(e,t){function i(e,t,i){return function(s){i._trigger(e,s,t._uiHash(t))}}this.reverting=!1;var s,a=[];if(!this._noFinalSort&&this.currentItem.parent().length&&this.placeholder.before(this.currentItem),this._noFinalSort=null,this.helper[0]===this.currentItem[0]){for(s in this._storedCSS)("auto"===this._storedCSS[s]||"static"===this._storedCSS[s])&&(this._storedCSS[s]="");this.currentItem.css(this._storedCSS).removeClass("ui-sortable-helper")}else this.currentItem.show();for(this.fromOutside&&!t&&a.push(function(e){this._trigger("receive",e,this._uiHash(this.fromOutside))}),!this.fromOutside&&this.domPosition.prev===this.currentItem.prev().not(".ui-sortable-helper")[0]&&this.domPosition.parent===this.currentItem.parent()[0]||t||a.push(function(e){this._trigger("update",e,this._uiHash())}),this!==this.currentContainer&&(t||(a.push(function(e){this._trigger("remove",e,this._uiHash())}),a.push(function(e){return function(t){e._trigger("receive",t,this._uiHash(this))}}.call(this,this.currentContainer)),a.push(function(e){return function(t){e._trigger("update",t,this._uiHash(this))}}.call(this,this.currentContainer)))),s=this.containers.length-1;s>=0;s--)t||a.push(i("deactivate",this,this.containers[s])),this.containers[s].containerCache.over&&(a.push(i("out",this,this.containers[s])),this.containers[s].containerCache.over=0);if(this.storedCursor&&(this.document.find("body").css("cursor",this.storedCursor),this.storedStylesheet.remove()),this._storedOpacity&&this.helper.css("opacity",this._storedOpacity),this._storedZIndex&&this.helper.css("zIndex","auto"===this._storedZIndex?"":this._storedZIndex),this.dragging=!1,this.cancelHelperRemoval){if(!t){for(this._trigger("beforeStop",e,this._uiHash()),s=0;a.length>s;s++)a[s].call(this,e);this._trigger("stop",e,this._uiHash())}return this.fromOutside=!1,!1}if(t||this._trigger("beforeStop",e,this._uiHash()),this.placeholder[0].parentNode.removeChild(this.placeholder[0]),this.helper[0]!==this.currentItem[0]&&this.helper.remove(),this.helper=null,!t){for(s=0;a.length>s;s++)a[s].call(this,e);this._trigger("stop",e,this._uiHash())}return this.fromOutside=!1,!0},_trigger:function(){e.Widget.prototype._trigger.apply(this,arguments)===!1&&this.cancel()},_uiHash:function(t){var i=t||this;return{helper:i.helper,placeholder:i.placeholder||e([]),position:i.position,originalPosition:i.originalPosition,offset:i.positionAbs,item:i.currentItem,sender:t?t.element:null}}})

                // Separate unsorted devices
                $('<style>.device + hr { display: block !important; } hr.miner-split { display: none; clear: both; }</style>').appendTo('head');
                $('<hr class="miner-split">').appendTo('.devices .panel-body');

                // TODO: Activate payout estimate tooltips

                // TODO: Add sell price tooltip

                // TODO: Roll up some loops here
                $('.hashlings-panel .panel-body').sortable({
                    update: function(e, ui) {
                        $.fn.stateFactory.setState(!1, 'hashling_order', $('.hashlings-panel .panel-body').sortable('toArray', { attribute: 'data-id' }), !0);
                    }
                });

                $('.hashlets-panel .panel-body').sortable({
                    update: function(e, ui) {
                        $.fn.stateFactory.setState(!1, 'hashlet_order', $('.hashlets-panel .panel-body').sortable('toArray', { attribute: 'data-id' }), !0);
                    }
                });

                $('.regular-panel .panel-body').sortable({
                    update: function(e, ui) {
                        $.fn.stateFactory.setState(!1, 'hardware_order', $('.regular-panel .panel-body').sortable('toArray', { attribute: 'data-id' }), !0);
                    }
                });

                var order;
                (order = $.fn.stateFactory.getState(!1, 'hashling_order', !0)) && $.each(order, function(i, id) {
                    $('[data-id=' + id + ']').appendTo($('.hashlings-panel .panel-body'));
                }) || $.fn.stateFactory.setState(!1, 'hashling_order', $('.hashlings-panel .panel-body').sortable('toArray', { attribute: 'data-id' }), !0);

                order = null;
                (order = $.fn.stateFactory.getState(!1, 'hashlet_order', !0)) && $.each(order, function(i, id) {
                    $('[data-id=' + id + ']').appendTo($('.hashlets-panel .panel-body'));
                }) || $.fn.stateFactory.setState(!1, 'hashlet_order', $('.hashlets-panel .panel-body').sortable('toArray', { attribute: 'data-id' }), !0);

                order = null;
                (order = $.fn.stateFactory.getState(!1, 'hardware_order', !0)) && $.each(order, function(i, id) {
                    $('[data-id=' + id + ']').appendTo($('.regular-panel .panel-body'));
                }) || $.fn.stateFactory.setState(!1, 'hardware_order', $('.regular-panel .panel-body').sortable('toArray', { attribute: 'data-id' }), !0);
            }, 1500);

            // Try to keep whole pool toolbox visible
            var $tbox = $('#hashlets-toolbox'),
                $w = $(window),
                tboxh = $tbox.height(),
                navh = $('div.navbar').height();
            $w.resize(os = function () { 
                $tbox.css({ top: 0 <= (d = tboxh + navh + 300 - $w.height()) ? Math.max(Math.min(75 - d + 270, 75), 0) + 'px' : '330px' });
            }) && os();

            // Tighter device display
            /*jshint multistr: true */
            $('<style>\
            .devices .device { max-width: 200px; }\
            .devices .device .device-settings { left: 14px; }\
            .devices .device .info .pool-icon-container { right: 10px; }\
            .devices .device .boost { left: 80px; }\
            .devices .device .device-frozen { left: 85px; }\
            .devices .device.hashlet-prime .info .pool-icon-container { left: 85px; }\
            .devices .device.hashlet-prime .info .second-pool-icon-container { left: 80px; }\
            .devices .device.hashlet-prime { max-width: 420px; }\
            .devices .device.hashlet-prime .device-settings { left: 356px; }\
            .devices .device.hashlet-prime .info .pool-icon-container { right: 10px; }\
            </style>').appendTo('head');
            /*jshint multistr: false */
            break;

        // Scripts for the invites page?
        // Nah. Scripts to create our own pages.
        case 'invites':
            switch(location.hash) {
                default:
                    console.log('Just taking up space.');
                    break;
            }
            break;

        default:
            console.log('Expecting something here? Suggest it!');
            break;
    }

    // Start our clock
    $.fn.jobClock.clock();

    // Fix sidebar animations and content width
    $('#toggle-sidebar').on('click', function(e) {
        var state = $('#sidebar').hasClass('hide-sidebar');
        state &&
            $('#sidebar').addClass('slideInLeft').removeClass('slideOutLeft') ||
            $('#sidebar').addClass('slideOutLeft').removeClass('slideInLeft');
        $('#toggle-sidebar i').css('transform', 'rotate(' + (state ? '0' : '-180deg') + ')');
        setTimeout(function() { $('#sidebar').toggleClass('hide-sidebar'); }, state ? 0 : 525);

        ($.fn.stateFactory.getState(!0, 'sidebar') && $('#content').css('padding-left', '210px')) ||
            (setTimeout(function() { $('#content').css('padding-left', '0'); }, 350));
    });

    // Display hacks
    setTimeout(function() {
        $('#sidebar').css('animation-duration', '700ms') // Slow the sidebar down a touch
            .css('-webkit-transform', 'translateZ(0)') // WebKit: Force hardware accel to fix sidebar flickering/disappearing
            .css('overflow-y', 'auto'); // WebKit: No need to see the scrollbar all the time, esp. with SlimScroll in place
        $('#toggle-sidebar i').css('transform-origin', '11.6px 11.3px').css('transition', 'transform 300ms ease'); // Sidebar toggle alignment fix + animation redef
        $('#sidebar').css('top', '50px'); // Avoid triggering a z-axis quirk in FF later
        $('.dataTable').css('width', '100%'); // Fluid tables
        $('.panel-controls > :not(:first-child)').css('display', 'inline-block'); // Inline refresh/filter controls
        $('.btc-spot-price').tooltip(); // Fix for pages that call this before our script runs
    }, 650);

    $('.version').text($('.version').text() + '_mz' + VERSION);
}); else
    alert('WARNING: An external website might be attempting to access your ZenMiner account. (MoreZen ' + VERSION + ')');
