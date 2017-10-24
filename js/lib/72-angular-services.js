angular.module('MoneyNetworkW2')

    // btcService and MoneyNetworkW2Service
    // abbreviations:
    // - MN - MoneyNetwork - main site
    // - W2 - MoneyNetworkW2 - plugin wallet site with test bitcoins

    .factory('btcService', ['$timeout', '$rootScope', '$window', '$location',
        function ($timeout, $rootScope, $window, $location) {
            var service = 'MoneyNetworkW2Service';
            console.log(service + ' loaded');

            // https://www.blocktrail.com/api/docs ==>

            var API_Key = '44bb2b39eaf2a164afe164560c725b4bf2842698' ;
            var API_Secret = 'f057354b22d9cbf9098e4c2db8e1643a3342c6fa' ;
            var api_client, bitcoin_wallet, bitcoin_wallet_backup_info ;

            var wallet_info = {
                status: 'n/a',
                confirmed_balance: null,
                unconfirmed_balance: null
            } ;
            function get_wallet_info () {
                return wallet_info ;
            }

            function init_api_client () {
                if (api_client) return ;
                api_client = blocktrail.BlocktrailSDK({
                    apiKey: API_Key,
                    apiSecret: API_Secret,
                    network: 'BTC',
                    testnet: true // test Bitcoins
                });
                return api_client ;
            }


            function create_new_wallet (wallet_id, wallet_password, cb) {
                var pgm = service + '.create_new_wallet: ' ;
                if (!wallet_id || !wallet_password) return cb('Wallet ID and/or password is missing') ;
                init_api_client() ;
                api_client.createNewWallet(wallet_id, wallet_password, function (err, wallet, backupInfo) {
                    if (err) return ;
                    bitcoin_wallet = wallet ;
                    bitcoin_wallet_backup_info = backupInfo ;
                    console.log('Backup info = ' + CircularJSON.stringify(backupInfo)) ;
                    wallet_info.status = 'Open' ;
                    get_balance(cb) ;
                }).then(
                    function () {
                        console.log(pgm + 'success: arguments = ', arguments);
                    },
                    function (error) {
                        console.log(pgm + 'error: arguments = ', arguments);
                        cb(error.message);
                    }
                ) ;
            } // create_new_wallet

            function init_wallet(wallet_id, wallet_password, cb) {
                var pgm = service + '.init_wallet: ';
                if (!wallet_id || !wallet_password) return cb('Wallet ID and/or password is missing');
                init_api_client();
                api_client.initWallet(
                    {identifier: wallet_id, passphrase: wallet_password},
                    function (err, wallet, primaryMnemonic, backupMnemonic, blocktrailPubKeys) {
                        if (err) return;
                        bitcoin_wallet = wallet;
                        bitcoin_wallet_backup_info = null;
                        wallet_info.status = 'Open';
                        get_balance(cb);
                    }).then(
                    function () {
                        console.log(pgm + 'success: arguments = ', arguments);
                    },
                    function (error) {
                        console.log(pgm + 'error: arguments = ', arguments);
                        cb(error.message);
                    }
                );
            } // init_wallet

            function get_balance (cb) {
                bitcoin_wallet.getBalance(
                    function(err, confirmedBalance, unconfirmedBalance) {
                        if (err) return cb(err) ;
                        wallet_info.confirmed_balance = blocktrail.toBTC(confirmedBalance) ;
                        // console.log('Balance: ', wallet_info.confirmed_balance);
                        wallet_info.unconfirmed_balance = blocktrail.toBTC(unconfirmedBalance) ;
                        // console.log('Unconfirmed Balance: ', wallet_info.unconfirmed_balance);
                        cb(null) ;
                    }
                );
            }

            function close_wallet (cb) {
                if (!bitcoin_wallet) return cb('Wallet not open. Please log in first') ;
                bitcoin_wallet = null ;
                bitcoin_wallet_backup_info = null ;
                wallet_info.status = 'n/a' ;
                wallet_info.confirmed_balance = null ;
                wallet_info.unconfirmed_balance = null ;
                cb(null) ;
            } // close_wallet

            function delete_wallet (cb) {
                if (!bitcoin_wallet) return cb('Wallet not open. Please log in first') ;
                // confirm operation!
                ZeroFrame.cmd("wrapperConfirm", ["Delele wallet?", "OK"], function (confirm) {
                    if (!confirm) return cb('Wallet was not deleted')  ;
                    // delete wallet
                    bitcoin_wallet.deleteWallet(function (error, success) {
                        if (success) {
                            bitcoin_wallet = null ;
                            wallet_info.status = 'n/a' ;
                            wallet_info.confirmed_balance = null ;
                            wallet_info.unconfirmed_balance = null ;
                            cb(null);
                        }
                        else cb('Could not delete wallet. error = ' + JSON.stringify(error)) ;
                    }) ;
                }) ;

            } // delete_wallet

            // get_new_address (receive money)
            function get_new_address (cb) {
                var pgm = service + '.get_new_address: ' ;
                if (!bitcoin_wallet) return cb('No bitcoin wallet found') ;
                bitcoin_wallet.getNewAddress(cb)
                    .then(function () {
                        console.log(pgm + 'success: arguments = ', arguments);
                    },
                    function (error) {
                        console.log(pgm + 'error: arguments = ', arguments);
                        cb(error.message);
                    });
            } // get_new_address

            function send_money (address, amount, cb) {
                var pgm = service + '.send_money: ' ;
                var satoshi = parseInt(amount) ;
                var btc = satoshi / 100000000 ;
                ZeroFrame.cmd("wrapperConfirm", ["Send " + satoshi + ' satoshi = ' + btc + ' tBTC<br>to ' + address +"?", "OK"], function (confirm) {
                    if (!confirm) return cb('Money was not sent') ;
                    var payment = {} ;
                    payment[address] = satoshi ;
                    bitcoin_wallet.pay(payment, null, false, true, blocktrail.Wallet.FEE_STRATEGY_BASE_FEE, cb) ;
                }) ;

            } // send_money

            // <== https://www.blocktrail.com/api/docs

            // export
            return {
                get_wallet_info: get_wallet_info,
                create_new_wallet: create_new_wallet,
                init_wallet: init_wallet,
                get_balance: get_balance,
                close_wallet: close_wallet,
                delete_wallet: delete_wallet,
                get_new_address: get_new_address,
                send_money: send_money
            };

            // end btcService
        }])


    .factory('MoneyNetworkW2Service', ['$timeout', '$rootScope', '$window', '$location', 'btcService',
        function ($timeout, $rootScope, $window, $location, btcService) {
            var service = 'MoneyNetworkW2Service';
            console.log(service + ' loaded');

            // for MN <=> W2 integration
            var wallet_info = btcService.get_wallet_info() ;

            // localStorage wrapper. avoid some ZeroNet callbacks. cache localStorage in ls hash
            // ls.save_login[auth_address] = { choice: '0', '1', '2' or '3', login: <choice 1: encrypted or unencrypted login> }
            var ls = { is_loading: true } ;
            //ls = [{
            //    "sessions": {
            //        "jro@zeroid.bit": {
            //            "this_pubkey": "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCsOMfAvHPTp0K9qZfoItdJ9898\nU3S2gAZZSLuLZ1qMXr1dEnO8AwxS58UvKGwHObT1XQG8WT3Q1/6OGlJms4mYY1rF\nQXzYEV5w0RlcSrMpLz3+nJ7cVb9lYKOO8hHZFWudFRywkYb/aeNh6mAXqrulv92z\noX0S7YMeNd2YrhqefQIDAQAB\n-----END PUBLIC KEY-----",
            //            "this_pubkey2": "Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R",
            //            "other_pubkey": "-----BEGIN PUBLIC KEY-----\nMIIBITANBgkqhkiG9w0BAQEFAAOCAQ4AMIIBCQKCAQBpQDut223gZcYfGTHxqoal\nDFX4PvQY1riWEPVqiO2eXS3E47XJjRUtMSUqzpb011ZxzauTxSXlTL1uunIykTvN\nmsXaNSq/tPIue0zdVSCN4PrJo5FY5P6SYGviZBLzdHZJYqlNk3QPngrBGJl/VBBp\nToPXmN7hog/9rXEGhPyN7GX2AKy3pPFCkXFC9GDlCoEjt0Pq+y5sF/t4iPXyn878\nirWfYbRPisLjnJGqSe23/c6MhP8CTvnbFvpiBcLES7HQk6hqqBBnLe9NLTABbqXK\n6i1LW6+aZRqOX72mMwU+1LTcbQRIW1nG6rtPhaUqiIzeH0g8B743bjmcJagm1foH\nAgMBAAE=\n-----END PUBLIC KEY-----",
            //            "other_pubkey2": "A4RQ77ia8qK1b3FW/ERL2HdW33jwCyKqxRwKQLzMw/yu",
            //            "encrypted_info": "[\"UPvLnGUi2vDpTiUqzfzF+QLKACBDFPycbrRSQf3l7neWclOYDguddp7u4kHAWeb+AXpAdgAg89WakZt3zbPIwc5L+8DsrVG8S74APeEvlRCv5bf5WjHYokT70IZylIg/X+QsUNG9biVYsRSUe6s02+AQJCn2Z3BCNoIyvAfuVEym9A+6knyktoS+ZxFNkwMCvJ/Jki5S0OuQkX4aaOlEt8McOvX2HA==\",\"oteCwG24VjKOOUQxz7wGPQ==\",\"TGXeFTOWPpkz/sMFUcNrifinytHHXGck5pJj6OwHK6h99Y7D+QGVlaVysZvlsZRAnMW4FK7MNlXw7FmNqMAVeLca+Uw6ZML+evjtibYy+UyYFUkNvnJZQLfFuMsQopGi\"]",
            //            "prvkey": "U2FsdGVkX1/ICZ/rij1Au+VA02bh4KEs7vla2+j4W5HPPyF0DRRjJIZf7p9FpEl4FXZgxEMlKwBrLhZEERMgYu4XOY0zCsqoWkX9WCu13xi4mhrg8IJtmDtqIujSh5ddjQ8VcxT4unvxCQOGpZ7s8H+/A9sTKm7fAqAzOdLpqMaX7u+QE0FibJGiRh2z7kylsPf1u8KIHWjICBMTuNzEvac1ah58fEVpeQgeRzdRxY4zj2Pa8OJRqeFeLJGMADqimnwGuiZ+kMDsQw2y0XO51wZrVoVY0M7kMVA3Vos1skH1/Ug0TLuyrKGQvZo/V7KhevdlwTj5FT9gPCpimXgBCMl+cFKWUQzkRYKx+OdgKFspMFohjLKJ+ZP5xlfXlziypHhgaBMdT6fXEMSGPtHlPeMGqTOna/GqjmCRuI3tUVoTwpER2ryADbUBlnZY4uBEpFWCmsUHYJgT+I0Yx9ZF/e8Zn9qYSp05APnlqVm0IA5Kl0gQGhJfCjIKeVbVeYmEaPKIe+Jc9eKcNx38AG8dUo85KDI1GQYd7iUdmV59ngSFjmP4goBEzkX/EmFck3oMeVTIahHedkyF/V8gIGQY1ouKCJ6ZyKgB9K2OQ3GqzmMNiMbAG6fklLgBPRJxVXb1jYtVCb2qdzFRKT1S9rGHjssIqYBJEU8XmGXwgUxJZPn4gg8JdFFGh6VodoqdJOhZc9FIHk5/E52cL3X+ZbDouErwGhh9a4+pcoR4zXKhuVx0XOKK8Bnfv9Baxgtjo/1KcpPve93L50U9B7E68ToFvdjyCaVjyf/9UKplYy40cO62p+HdkPRw2bOGo6RrjtVsEsvbXxMRYrPh8mD3k4uZvB4FaV+egLPR/NOPsRS+eHohtZndzMPRVbZqVSts5zNvNGSe5dy+vfvR+REoM3shFqM2hhQCk8LzGYplU0Kq3qJYtTe1R3nyOMzCyqaxNNNmP/wXLSo2O26RcsXJp3d+ABFkxB4MSjPSRqyF7bbJ1Cf2cpqAStrjr57w3nRLc235rUeuDVkEcWdTLw0C+dMVU+WtKOgg5BSxeIDuDuXXYcFMtCD0HFyEgxgOxE4Hx8GXgRj41F6nqBrFSK2U87AQeWmA+fRm5I1hLLi1wpKMxErx1rBT/H3PGdstvF9XEiytZsZI04KVTYM9I5FHm/BPGJqrtemyJS70F6yHQ2e2qrkkb9+MXa+SPF2prj4/qWoI",
            //            "sessionid": "U2FsdGVkX1/hQbcjOztF8NtZk5xb7y+ho/zbceopRMB6g0ok7IjI93PdX6Ip5VS8oOkfQ+xfgudkVLnKI+mhiZzjDlIUqYJi0gdVz+ehLbU="
            //        }
            //    }, "save_login": {"jro@zeroid.bit": "2"}
            //}];
            //ls = [{
            //    "sessions": {
            //        "jro@zeroid.bit": {
            //            "this_pubkey": "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCsOMfAvHPTp0K9qZfoItdJ9898\nU3S2gAZZSLuLZ1qMXr1dEnO8AwxS58UvKGwHObT1XQG8WT3Q1/6OGlJms4mYY1rF\nQXzYEV5w0RlcSrMpLz3+nJ7cVb9lYKOO8hHZFWudFRywkYb/aeNh6mAXqrulv92z\noX0S7YMeNd2YrhqefQIDAQAB\n-----END PUBLIC KEY-----",
            //            "this_pubkey2": "Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R",
            //            "other_pubkey": "-----BEGIN PUBLIC KEY-----\nMIIBITANBgkqhkiG9w0BAQEFAAOCAQ4AMIIBCQKCAQBpQDut223gZcYfGTHxqoal\nDFX4PvQY1riWEPVqiO2eXS3E47XJjRUtMSUqzpb011ZxzauTxSXlTL1uunIykTvN\nmsXaNSq/tPIue0zdVSCN4PrJo5FY5P6SYGviZBLzdHZJYqlNk3QPngrBGJl/VBBp\nToPXmN7hog/9rXEGhPyN7GX2AKy3pPFCkXFC9GDlCoEjt0Pq+y5sF/t4iPXyn878\nirWfYbRPisLjnJGqSe23/c6MhP8CTvnbFvpiBcLES7HQk6hqqBBnLe9NLTABbqXK\n6i1LW6+aZRqOX72mMwU+1LTcbQRIW1nG6rtPhaUqiIzeH0g8B743bjmcJagm1foH\nAgMBAAE=\n-----END PUBLIC KEY-----",
            //            "other_pubkey2": "A4RQ77ia8qK1b3FW/ERL2HdW33jwCyKqxRwKQLzMw/yu",
            //            "encrypted_info": "[\"UPvLnGUi2vDpTiUqzfzF+QLKACBDFPycbrRSQf3l7neWclOYDguddp7u4kHAWeb+AXpAdgAg89WakZt3zbPIwc5L+8DsrVG8S74APeEvlRCv5bf5WjHYokT70IZylIg/X+QsUNG9biVYsRSUe6s02+AQJCn2Z3BCNoIyvAfuVEym9A+6knyktoS+ZxFNkwMCvJ/Jki5S0OuQkX4aaOlEt8McOvX2HA==\",\"oteCwG24VjKOOUQxz7wGPQ==\",\"TGXeFTOWPpkz/sMFUcNrifinytHHXGck5pJj6OwHK6h99Y7D+QGVlaVysZvlsZRAnMW4FK7MNlXw7FmNqMAVeLca+Uw6ZML+evjtibYy+UyYFUkNvnJZQLfFuMsQopGi\"]",
            //            "prvkey": "U2FsdGVkX1/ICZ/rij1Au+VA02bh4KEs7vla2+j4W5HPPyF0DRRjJIZf7p9FpEl4FXZgxEMlKwBrLhZEERMgYu4XOY0zCsqoWkX9WCu13xi4mhrg8IJtmDtqIujSh5ddjQ8VcxT4unvxCQOGpZ7s8H+/A9sTKm7fAqAzOdLpqMaX7u+QE0FibJGiRh2z7kylsPf1u8KIHWjICBMTuNzEvac1ah58fEVpeQgeRzdRxY4zj2Pa8OJRqeFeLJGMADqimnwGuiZ+kMDsQw2y0XO51wZrVoVY0M7kMVA3Vos1skH1/Ug0TLuyrKGQvZo/V7KhevdlwTj5FT9gPCpimXgBCMl+cFKWUQzkRYKx+OdgKFspMFohjLKJ+ZP5xlfXlziypHhgaBMdT6fXEMSGPtHlPeMGqTOna/GqjmCRuI3tUVoTwpER2ryADbUBlnZY4uBEpFWCmsUHYJgT+I0Yx9ZF/e8Zn9qYSp05APnlqVm0IA5Kl0gQGhJfCjIKeVbVeYmEaPKIe+Jc9eKcNx38AG8dUo85KDI1GQYd7iUdmV59ngSFjmP4goBEzkX/EmFck3oMeVTIahHedkyF/V8gIGQY1ouKCJ6ZyKgB9K2OQ3GqzmMNiMbAG6fklLgBPRJxVXb1jYtVCb2qdzFRKT1S9rGHjssIqYBJEU8XmGXwgUxJZPn4gg8JdFFGh6VodoqdJOhZc9FIHk5/E52cL3X+ZbDouErwGhh9a4+pcoR4zXKhuVx0XOKK8Bnfv9Baxgtjo/1KcpPve93L50U9B7E68ToFvdjyCaVjyf/9UKplYy40cO62p+HdkPRw2bOGo6RrjtVsEsvbXxMRYrPh8mD3k4uZvB4FaV+egLPR/NOPsRS+eHohtZndzMPRVbZqVSts5zNvNGSe5dy+vfvR+REoM3shFqM2hhQCk8LzGYplU0Kq3qJYtTe1R3nyOMzCyqaxNNNmP/wXLSo2O26RcsXJp3d+ABFkxB4MSjPSRqyF7bbJ1Cf2cpqAStrjr57w3nRLc235rUeuDVkEcWdTLw0C+dMVU+WtKOgg5BSxeIDuDuXXYcFMtCD0HFyEgxgOxE4Hx8GXgRj41F6nqBrFSK2U87AQeWmA+fRm5I1hLLi1wpKMxErx1rBT/H3PGdstvF9XEiytZsZI04KVTYM9I5FHm/BPGJqrtemyJS70F6yHQ2e2qrkkb9+MXa+SPF2prj4/qWoI",
            //            "sessionid": "U2FsdGVkX1/hQbcjOztF8NtZk5xb7y+ho/zbceopRMB6g0ok7IjI93PdX6Ip5VS8oOkfQ+xfgudkVLnKI+mhiZzjDlIUqYJi0gdVz+ehLbU="
            //        }
            //    }, "save_login": {"jro@zeroid.bit": "2"}
            //}];

            function ls_load() {
                ZeroFrame.cmd("wrapperGetLocalStorage", [], function (res) {
                    var pgm = service + '.wrapperGetLocalStorage callback: ';
                    var key, cb ;
                    // console.log(pgm + 'typeof res =' + typeof res) ;
                    // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                    if (!res) res = [{}] ;
                    res = res[0];
                    // moving values received from ZeroFrame API to JS copy of local storage
                    ls_loaded(res) ;
                }) ;
            } // ls_load
            ls_load() ;

            // localStorage loaded
            function ls_loaded(res) {
                // is siteInfo ready?
                var pgm = service + '.ls_loaded: ' ;
                var wait_for_site_info, key, cb ;
                wait_for_site_info = function() { ls_loaded(res) };
                if (!ZeroFrame.site_info) {
                    $timeout(wait_for_site_info, 500) ;
                    return ;
                }
                // siteInfo is ready
                for (key in res) ls[key] = res[key] ;
                // console.log(pgm + 'ls = ' + JSON.stringify(ls)) ;

                // migrate to newest ls structure
                if (ls.transactions) {
                    // rename transactions to w_sessions
                    ls.w_sessions = ls.transactions ;
                    delete ls.transactions ;
                }
                if (ls.sessions) {
                    // rename sessions to mn_sessions
                    ls.mn_sessions = ls.sessions ;
                    delete ls.sessions ;
                }

                delete ls.is_loading ;
                // run callbacks waiting for ls and site_info to be ready. see ls_bind
                while (ls_cbs.length) {
                    cb = ls_cbs.shift() ;
                    cb() ;
                }
            } // ls_loaded

            var ls_cbs = [] ; // any callbacks waiting for ls finish loading?
            function ls_bind(cb) {
                if (ls.is_loading) ls_cbs.push(cb) ;
                else cb() ;
            }

            function ls_get () { return ls }
            function ls_save() {
                var pgm = service + '.ls_save: ' ;
                console.log(pgm + 'ls = ' + JSON.stringify(ls)) ;
                //ls = {
                //    "save_login": {
                //        "18DbeZgtVCcLghmtzvg4Uv8uRQAwR8wnDQ": {
                //            "choice": "1",
                //            "permissions": {
                //                "encryption": 2,
                //                "message": "[\"b/3l7U8pIt5bnJTc4bOohwLKACAMY5dg42XKaK4zcAF0tc23si69C6RAIzqksjNwxA0UqQAgtS+js0qGCx2oxSLutHZXyKcUrPv7tQCCh8PO8B4ViUSaKHvkeXvPFy6alSxpwUWc1j2cbhcc83qX9DsFyt3sFhnxd/TIzcr5TeUUC+jjVKeBmBWAAV22i5/Ngdv5eslD7Ha/V8+4UYFKZo7KZOjGRw==\",\"osQiwYyvmGU4jBMHpjvUDw==\",\"B+hy1k4kGDkMPi6Jw8W0xJw3DGInfXFFxZEWlgyCmi5/0nGlPvcb/wdWEapZ7geYKiz7MHm2Fl/QEmVKqOlq01jQMFJRA1VMzBWg15CEO8ZKQk+E4oaLim6XaSUdF45A+qjH7ItJNjVay5G/TTZIEHZVcs7bKNuvuHXKZ2qckbJz3yfXUiu7dQSakqUJYD6ppxcoNx0jgBozog0Vyff/AA==\"]"
                //            },
                //            "login": {
                //                "encryption": 2,
                //                "message": "[\"6n1bj8fVcDDsfieevqFxwALKACCJMCifjojRvLpxnnAzFlqdbRngr8xGeyYCQqwvZdMNWAAgj8QseOIdrp+xtb+9Szb8L99olhI20qQxGfSVTX4aPWMzWD4cQ2C6AeKHxGFaGirO48zWp6gfqIb0RrVxR0jMHL7nA/tlBjDgFwdu1gp9kVrcdIsDd18btRgiUNzULgd1+mzIRnhA9coKH+EJc2ss1g==\",\"DRbUxJjtaMJSSaK1jNpQ+Q==\",\"94+a1HgliFNJfYKpY7woNO1YHBxWM/C371cDV7IYETnsoToH0HUl5bWvosjW5vY9evMQTwLlTLPfgdTFnuaNZLRqNCzaT38xJhC8lHTsNxqIVWOU7LEXDfG17d/BINVEKf23bpjeOG7YC6SEJcmaOQ==\"]"
                //            }
                //        }
                //    },
                //    "sessions": {
                //        "18DbeZgtVCcLghmtzvg4Uv8uRQAwR8wnDQ": {
                //            "this_pubkey": "-----BEGIN PUBLIC KEY-----\nMIGeMA0GCSqGSIb3DQEBAQUAA4GMADCBiAKBgGIQnT7AZjmmKJswjbDYeSv4V3D6\n3oNGaMT24VFTwyksQAzV3L+ghC5jo/UjOshRM7QlNw+W9eTV5hNgzvQqxkj4BAiS\nEw81FfKxXy9+oPubTNXC8uaxaMr7W7EG5Edfj51PENyB58fMdIoy4D7QOB2sB7LV\nvYOTzldDfyAdC3PLAgMBAAE=\n-----END PUBLIC KEY-----",
                //            "this_pubkey2": "Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R",
                //            "other_pubkey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0pMuMJyynH1BmhMJ6vvd\nQZplIBgiiOQSqwu2SpYKICm+P1gGNHnICQic/Nuqi9t93rxJLfWCsl0+lCtoJLen\nf78xz4XzEcGPBeBFn2TbQqPO9loylNlaOgiqDG5qcSc9n7yEF0xmpReDGATwzECi\nJrpZBImwhUMO48iS08b4IfQaMsbnUVY8hdUeJiQ831kMkNQLtxWaeRiyn8cTbKQ6\nLXCDG7GDaFN6t+x3cv/xBX06+ykuYQ0gNIBySiIz69RYzhvOkqOQggLWPF+NMW1J\nO6VRqvX7Sybwm51v3kGGKWeX4znvGY+GwVCpwiH+b2hbGZHIqFp9ogimGVE0WPgu\nnwIDAQAB\n-----END PUBLIC KEY-----",
                //            "other_pubkey2": "A4RQ77ia8qK1b3FW/ERL2HdW33jwCyKqxRwKQLzMw/yu",
                //            "encrypted_info": "[\"sn53LVGGihpV2d8drGWuwALKACC0v1nnRX3J/7RndNzgY0mf1Iscvh4Qu1sbYvA9a2hTJwAgDznVN4TeSgnY0b0St3ONhVcqTB14IZBT8nEauiG/UrEkZKPIY602dAmztkrnE5TlVhKp5i9+1MqZveQ+tzl1G4HI//mXOPF/xA583Z1IF/ZFbZnygHP8w1nsjmGKsTqzb/zHjL20m42fXyNA1lGx1Q==\",\"2GyYG+cI/1xKV23IthSMCg==\",\"he0SPrDzG0iBh+Vf3xiuxtKejb3Ennjw0yRpD5XfQYlnUE9csHfcd9LzhwPJabnvedkb/L1DahNE9aH21ovhCMzS4gQlsv5WkTouu8ONt05ZOEk8hjnu8hFtX80WGRcy\"]",
                //            "prvkey": "U2FsdGVkX18dRxJbzKepCZLCm1y+Vb7BX6ty/NxLYRiYGVuu4q9TU7csFcu6PhoGr9IFGpH8CpIc24uqEOWQz3TpLqen6gTP7tCMHhfpyariODvHR5HAuOQeNVZHCXRwello6A9pmaq2iRXWmOXu53veYejV9dsqPlEGGBOxPWauiCCJDpnX7LCOKv4sep8InhlxeJvIxJncRugH+F6ZvNSNx6JCFHFmnqm7+nAbtbjja2FvCQ5ZhinC4PCS/pVJQsuEKRqek3IEpHO2eE+Hz0AKezDiuKiG3ifIaXdp9d5E99JdkABDQRZrYJtotukLOKBrNCPaVehRFVP4Z8LornSmot+01uKYOmtYwvoBsAHD3yPA4YF+N+8L7VJxA79lHXbXPIPV2wQZVs0Y00r6Q9upiU20nKopcRT84hcbv1BLQ0YE1gk7Ojx1Rjm/dEEgAGrKZJBI+JJjqgYCjxR7H3BQh2N3y8jY5xXWoH+wvbqANqI1ZmLXBOgzeE6wnBM+8O23ShfRw/v9W4dFdEFY4lIaH7I7hI6lzrWcfHh9AW19ntokmSM5C88Hg/BF20vvXLZgQLV+fV0IrlN0goRKDRpvL/yb4CR4VcK581bEV1iQZhMcRAubaYB8WFkk245ALPzngEyNJK4MMdgOMbbBkCi404l+X1Z1IZ6nusC8EAXeqYuTZqh2qvUTbFe+JFcZCMjCqkIvAKX9H0gfRLKhTajDxI2llKhJ0HMQS/VFcwZzsSH6gVO/N+yNQu5zBQzl9Qh3+F9EatZgVYuc1gQHObR8/lbJieTBcsF4PCP1WBDM/KN6RTOH0TKzZD/x8cDjnVDlLtNy6/hFPMmft8nBYn10kaNPg5Ho0lWljOBFYDcWWsNpvB4AHDArJ4UsiS0E9rSramA0+xgTO7QVkNokBuLge9ihJ2Rop55GCmIt3Y8NY7fKiagy5WFZNtiCtHCQc5MJO12Jvqg76lq2rlptzXlzhtpgVJhvZvKfu6RQFDQn4gNnmxG4penVBU5y2N69612HFi2BTB5RICkN+6tjS07lf2Ets+f7nFTqN+xJ4rV4bKO3mNkOQKoTn3a0rRHO7GefLqnomRufaCrteISbGIy7KIXJWR4B7xSDQC1skMO063YkCrJu7NpTlzThJa0jwM2peMMpWCDFx+YQjU+6qQak9mdLGA4tZcvtPz8RFyEGKJ1jlEv+cRyEYOBeoq3w",
                //            "sessionid": "U2FsdGVkX1/eobzTw2IF55TPF1Wy21wSqyYN6Jlx7T3iSmiUZP23r93gbcq8LvgyF+VyzafV331MDXkOfhqo4vPS2vWzCkGex6I4pU1DXfo="
                //        }
                //    },
                //    "transactions": {
                //        "18DbeZgtVCcLghmtzvg4Uv8uRQAwR8wnDQ": {
                //            "1a85fd6465e75f61656c08ccc2c21b6feaa09b41fb25afe20dd8677da751f590": {
                //                "encryption": 2,
                //                "message": "[\"7aKr3+VWui7XRWnVgddu9wLKACDrXUVe0cv7Y6z07vmbyBV01855YoJEfvYioTX4mM1YNwAgssK7M0FR/JP9ybH6KOJVq4sIPiNlTJQzIzqan5aKL1besed7FLoVIxkhs/zNGVxQp1YRFR+gllB9dnQPSQGgSXduX2IATj2pGzy6PoxAfPBhciDdyrv+fv1ARwFMhcMm9J2/wBFrQAH7G3ITp38/QA==\",\"ntFOD3S/czU4CQ4tp5lXBw==\",\"xQmB2Uy9Cea6Cxbt2wZgNzpeiP7ZdANOdF0nWsHY+g3Bv3SP/8r6X8LJ07ybhmM10at6HfEJhonzYJxZOkItTYF+HH49fUwjbAmUxhU301GE+h1V9cqrro8aqfgjvA9WjIIl02uXfxoAOH8F5ZOKAkoABaRoOvSj+8ZlVeQeNW9joFuA3hyNP3LqbT5pJCrWfSuVd5CxqkiRN6Za3fxIhnXQvC6FXMFe5gv2yX6bL3EfbliImh+F/n6C6BwA5mbNAgYo4QEK3BevFbqB4DQdVwFb0CymOIscqDOOmBKEhhJQtXoGBqvu7R5zTe/FiJuCEuuHoDUUXaQYcwvBgVHxCawTGwtcKdUQkYKqYXAwPK4B3sAbNU0qlhGCDkrn7PgwOL0otht2EWP4fmX6v1QWAEJgboowpsExk5ISB9OixUw5C7dE1nMtKzUDHAHPRwCheIjlPYSAKzI7/2/+XGzpgk1TjIQE3l3OimA1+pt4WmOFjEOj4cTebqEg5vjoUCI+IY/eslXD3dxhIzJWys4dn7FDLPzWQV7D3iaYX/6m3YY+iDYeZUXr2go3aETu69Z2nFcicjUk6j2OrWo939T7uPO9V4j9Tvg1dioujYRPob6Li2WjpD1HwJVm4fAQUYkE9c5Btd5VkN0OwivW1hoQVHZb6B9uRFtpf4UQjXVgfg4c2huerJiMkG5fYfiLK6pn1QUlBfAFHdRrZZdis7jvC2fYXyK0TPqV7nnuejfuLvqWHsbu6AlhNIIjesG4pz1yU/gJmazKzbiL47AE5FEjsukuuvnFcwkVdivc9VRiBPci1nJe0IFhKgmsuRHoGv1Su67tP3VG7jbazRTfI6IAqO5ge7+q1nRLh4tvqw+7Q1z6TqATxfKQWfdVnUz9c8o/mv8P5uYE9J0V1OK9IFgu5n8dF2+nI23Oa81lUji5Ig5+3VZ38MeSRVL/veGHRNdHmGKKRCmtQDLqX6bEFfWONGZlPd0IaTyIcq9zPnjA7qQxwSQKeFYrMBHk5l4g6O+NGklJdsNisCGrkgMQruqxmpxyo0IsLglyGq4lMW+VJ4t9oJrl1T2KRgFIqmUYVQVQs/4FEJyR9hsj6m6rTjPQDvT0iBvJd53cxnv/5/ugS9nPlO0Dfv5GzI6rjBQFFAwEkwklGEvIWcYkzDIVIGrRBLNbYuZK8cZh7XwPIiFejFEMm/wpbO+jYOLrKbIzh5OAeUc0YIJQk4zWILYWkOySyXt2dPn6Z1lkNA562Hfoj1k9/inDYT4HL+SrvQCgAmBgDT8qRpdDVo1paFgoQSWnXjMpn2KbjNPPF5tpZmb8HsPBHXAQ6a/mcWGjaDXLtLPzN3USDFwvJ1zQMd+med/PWmaSc4maG2UjLafj4AXY+ugq6sRnVvotCxhCMSGY032g\"]"
                //            }
                //        }
                //    }
                //};
                ZeroFrame.cmd("wrapperSetLocalStorage", [ls], function () {}) ;
            } // ls_save


            // setup MoneyNetworkAPI
            // MoneyNetworkAPILib.config({debug: true, ZeroFrame: ZeroFrame, optional: "^[0-9a-f]{10}.[0-9]{13}$"}) ; // global options
            MoneyNetworkAPILib.config({debug: true, ZeroFrame: ZeroFrame, optional: "^[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f].[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]$"}) ; // global options

            var encrypt1 = new MoneyNetworkAPI({debug: 'encrypt1'}) ; // encrypt1. no sessionid. self encrypt/decrypt data in W2 localStorage ;

            var save_wallet_id, save_wallet_password ; // last saved wallet id and password. For get_balance request

            // save_wallet_login:
            // - '1': wallet login is saved encrypted (cryptMessage) in W2 localStorage
            // - '2' & '3': wallet login is saved encrypted (symmetric) in MN localStorage (session is required)
            function get_wallet_login(save_wallet_login, cb) {
                var pgm = service + '.get_wallet_login: ' ;
                var error, auth_address, user_login_info, login, encrypted_json, request ;
                if (['1','2','3'].indexOf(save_wallet_login) == -1) return cb(null, null, "Invalid call. save_wallet_login must be equal '1', '2' or '3'") ;
                if (save_wallet_login == '1') {
                    // wallet login is saved encrypted (cryptMessage) in W2 localStorage
                    if (!ls.save_login) return cb(null, null, 'save_login hash was not found in localStorage') ;
                    if (typeof ls.save_login != 'object') {
                        error = 'save_login was not a hash. save_login = ' + JSON.stringify(ls.save_login) ;
                        ls.save_login = {} ;
                        ls_save() ;
                        return cb(null, null, error) ;
                    }
                    auth_address = ZeroFrame.site_info.cert_user_id ? ZeroFrame.site_info.auth_address : 'n/a' ;
                    user_login_info = ls.save_login[auth_address] ;
                    if (!user_login_info) return cb(null, null, 'Wallet login for ' + auth_address + ' was not found') ;
                    if (auth_address == 'n/a') {
                        // no ZeroNet certificate. login is saved unencrypted in ls
                        login = user_login_info.login ;
                        console.log(pgm + 'unencrypted login = ' + JSON.stringify(login)) ;
                        if (!login) return cb(null, null, 'Wallet login for ' + auth_address + ' was not found') ;
                        if (typeof login != 'object') {
                            error = 'save_login[' + auth_address + '].login is not a hash. save_login = ' + JSON.stringify(login) ;
                            user_login_info.login = {} ;
                            ls_save() ;
                            return cb(null, null, error) ;
                        }
                        save_wallet_id = login.wallet_id ;
                        save_wallet_password = login.wallet_password ;
                        return cb(save_wallet_id, save_wallet_password, null) ;
                    }
                    // ZeroNet certificate present. decrypt login
                    encrypted_json = user_login_info.login ;
                    console.log(pgm + 'encrypted_json = ' + JSON.stringify(encrypted_json));
                    encrypt1.decrypt_json(encrypted_json, function(json) {
                        var pgm = service + '.get_wallet_login decrypt_json callback: ' ;
                        console.log(pgm + 'json = ' + JSON.stringify(json)) ;
                        if (!json) cb(null, null, 'decrypt error. encrypted_json was ' + JSON.stringify(user_login_info)) ;
                        else {
                            save_wallet_id = json.wallet_id ;
                            save_wallet_password = json.wallet_password ;
                            cb(save_wallet_id, save_wallet_password, null) ;
                        }
                    }) ; // decrypt_json callback
                }
                else {
                    // save_wallet_login == '2' or '3'
                    // wallet login is saved encrypted (symmetric) in MN localStorage (session is required)
                    if (!status.sessionid) return cb(null, null, 'Cannot read wallet information. MN session was not found');
                    // send get_data message to MN and wait for response
                    request = { msgtype: 'get_data', keys: ['login'] } ;
                    console.log(pgm + 'sending get_data request to MN. request = ' + JSON.stringify(request)) ;
                    encrypt2.send_message(request, {response: true}, function (response) {
                        var pgm = service + '.get_wallet_login send_message callback: ' ;
                        var encrypted_data, data, decrypt_row ;
                        if (response.error) return cb(null, null, response.error) ;
                        console.log(pgm + 'response = ' + JSON.stringify(response));
                        // response.data - array with 0-n rows with encrypted data. decrypt 0-n data rows
                        encrypted_data = response.data ;
                        data = [] ;
                        decrypt_row = function(cb2) {
                            var pgm = service + '.get_wallet_login.decrypt_row: ' ;
                            var encrypted_row, encrypted_json ;
                            if (encrypted_data.length == 0) return cb2() ;
                            encrypted_row = encrypted_data.shift() ;
                            console.log(pgm + 'encrypted_row = ' + JSON.stringify(encrypted_row)) ;
                            encrypted_json = JSON.parse(encrypted_row.value) ;
                            encrypt1.decrypt_json(encrypted_json, function (decrypted_json) {
                                var pgm = service + '.get_wallet_login.decrypt_row decrypt_json callback: ' ;
                                var decrypted_row ;
                                decrypted_row = {key: encrypted_row.key, value: decrypted_json} ;
                                console.log(pgm + 'decrypted_row = ' + JSON.stringify(decrypted_row));
                                data.push(decrypted_row) ;
                                decrypt_row(cb2) ;
                            }) ; // decrypt_json callback 1
                        };
                        decrypt_row(function() {
                            var pgm = service + '.get_wallet_login decrypt_row callback: ' ;
                            response.data = data ;
                            if ((response.data.length != 1) || (response.data[0].key != 'login')) {
                                console.log(pgm + 'error. expected one row with login info to be returned in data array. response to get_data message was ' + JSON.stringify(response));
                                return cb(null, null, 'Error. Wallet login info was not returned from MN') ;
                            }
                            // OK. received wallet login from MN
                            console.log(pgm + 'data[0] = ' + JSON.stringify(data[0])) ;
                            // data[0] = {"key":"login","value":{"wallet_id":"UZGToFfXOz7GKCogsOOuxJYndjcmt2","wallet_password":"bGaGK/+w(Qm4Wi}fAyz:CcgxWuen)F"}}
                            save_wallet_id = data[0].value.wallet_id ;
                            save_wallet_password = data[0].value.wallet_password ;
                            cb(save_wallet_id, save_wallet_password, null);
                        }) ; // decrypt_row callback

                    }) ; // send_message callback
                }
            } // get_wallet_login


            // save_wallet_login:
            // - '0': no thank you. Clear any wallet data previously saved with '1' or '2'
            // - '1': wallet login is saved encrypted (cryptMessage) in W2 localStorage
            // - '2': wallet login is saved encrypted (symmetric) in MN localStorage (session is required)
            function save_wallet_login(save_wallet_login, wallet_id, wallet_password, cb) {
                var pgm = service + '.save_wallet_login: ';
                var cert_user_id, auth_address, data, request, old_login, save_w2;
                console.log(pgm + 'save_wallet_login = ' + save_wallet_login + ', wallet_id = ' + wallet_id + ', wallet_password = ' + wallet_password);
                if (['0', '1', '2', '3'].indexOf(save_wallet_login) == -1) return cb({error: "Invalid call. save_wallet_login must be equal '0', '1', '2' or '3'"});

                // save wallet login choice in W2 localStorage (choice = 0, 1, 2 or 3
                cert_user_id = ZeroFrame.site_info.cert_user_id ;
                auth_address = cert_user_id ? ZeroFrame.site_info.auth_address : 'n/a' ;
                if (!ls.save_login) ls.save_login = {};
                if (cert_user_id && ls.save_login[cert_user_id]) delete ls.save_login[cert_user_id] ; // old index
                if (!ls.save_login[auth_address]) ls.save_login[auth_address] = {};
                if (typeof ls.save_login[auth_address] != 'object') {
                    console.log(pgm + 'error. ls.save_login[auth_address] was not a hash. ls.save_login[auth_address] = ' + JSON.stringify(ls.save_login[auth_address])) ;
                    ls.save_login[auth_address] = {} ;
                }
                old_login = JSON.parse(JSON.stringify(ls.save_login[auth_address]));
                ls.save_login[auth_address].choice = save_wallet_login;
                console.log(pgm + 'ls = ' + JSON.stringify(ls)) ;
                ls_save();

                // for get_balance request
                save_wallet_id = wallet_id ;
                save_wallet_password = wallet_password ;

                // get and add W2 pubkey2 to encryption setup (self encrypt using ZeroNet certificate)
                get_my_pubkey2(function (my_pubkey2) {
                    var pgm = service + '.save_wallet_login get_my_pubkey2 callback 1: ';
                    var save_w2;
                    encrypt1.setup_encryption({pubkey2: my_pubkey2});

                    // save in W2 localStorage (choice '0' and '1')
                    save_w2 = function (cb) {
                        var pgm = service + '.save_wallet_login.save_w2: ';
                        var unencrypted_login;
                        if (save_wallet_login != '1') {
                            // delete any old login info from W2 localStorage
                            delete ls.save_login[auth_address].login;
                            ls_save();
                            return cb();
                        }
                        // save login info in W2 localStorage
                        if (auth_address == 'n/a') {
                            // no cert_user_id. not encrypted
                            ls.save_login[auth_address].login = {
                                wallet_id: wallet_id,
                                wallet_password: wallet_password
                            };
                            ls_save();
                            return cb();
                        }
                        // cert_user_id: encrypt login
                        unencrypted_login = {wallet_id: wallet_id, wallet_password: wallet_password};
                        console.log(pgm + 'encrypt1.other_pubkey2 = ' + encrypt1.other_session_pubkey2);
                        encrypt1.encrypt_json(unencrypted_login, [2], function (encrypted_login) {
                            ls.save_login[auth_address].login = encrypted_login;
                            ls_save();
                            return cb();
                        });
                    }; // save_w2

                    save_w2(function () {
                        var pgm = service + '.save_wallet_login save_w2 callback 2: ';
                        // update MN localStorage (choice '2' and '3')
                        if (['2', '3'].indexOf(save_wallet_login) != -1) {
                            if (!status.sessionid) {
                                ls.save_login[auth_address] = old_login;
                                return cb({error: 'Error. Cannot save wallet information in MN. MN session was not found'});
                            }
                            // encrypt wallet data before sending data to MN
                            data = {wallet_id: wallet_id, wallet_password: wallet_password};
                            console.log(pgm + 'data = ' + JSON.stringify(data));
                            // cryptMessage encrypt data with current ZeroId before sending data to MN.
                            // encrypt data before send save_data message
                            encrypt1.encrypt_json(data, [2], function (encrypted_data) {
                                var pgm = service + '.save_wallet_login encrypt_json callback 3: ';
                                var request;
                                console.log(pgm + 'data (encrypted) = ' + JSON.stringify(encrypted_data));
                                // send encrypted wallet data to MN and wait for response
                                request = {
                                    msgtype: 'save_data',
                                    data: [{key: 'login', value: JSON.stringify(encrypted_data)}]
                                };
                                console.log(pgm + 'json = ' + JSON.stringify(request));
                                encrypt2.send_message(request, {response: true}, function (response) {
                                    var pgm = service + '.save_wallet_login send_message callback 4: ';
                                    if (!response) cb({error: 'No response'});
                                    else if (response.error) cb({error: response.error});
                                    else cb({}); // OK. login saved in MN
                                }); // send_message callback 4
                            }); // encrypt_json callback 3

                        }
                        else {
                            // 0 or 1. clear old 2
                            if (!status.sessionid) return cb({}); // error: 'Cannot clear wallet information. MN session was not found'
                            // send data_delete to MN session
                            request = {msgtype: 'delete_data'}; // no keys array. delete all data for session
                            console.log(pgm + 'json = ' + JSON.stringify(request));
                            encrypt2.send_message(request, {response: true}, function (response) {
                                var pgm = service + '.save_wallet_login send_message callback 1: ';
                                if (!response) cb({error: 'No response'});
                                else if (response.error) cb({error: response.error});
                                else cb({});
                            }); // send_message callback 1
                        }

                    }); // save_w2 callback 2

                }); // get_my_pubkey2 callback 1

            } // save_wallet_login

            // MN-W2 session. only relevant if W2 is called from MN with a sessionid or an old still working MN-W2 session can be found in localStorage
            // session status: use at startup and after changing/selecting ZeroId
            var status = {
                old_cert_user_id: -1,
                sessionid: null,
                merger_permission: 'n/a', // checking Merger:MoneyNetwork permission
                session_handshake: 'n/a', // checking old/new session
                save_login: '0', // radio group '0', '1' (W2 LS) or '2' (MN LS)
                save_login_disabled: true, // radio group disabled while checking save_wallet_login status
                permissions: {}, // MoneyNetwork permissions to wallet operations
                offline: [] // array with offline outgoing money transaction
            } ;
            function get_status () { return status }

            // get permissions from ls (rules for MoneyNetwork wallet operations)
            function get_permissions (cb) {
                var pgm = service + '.get_permissions: ' ;
                var error, auth_address, user_info, permissions, encrypted_json, key ;
                if (!ls.save_login) return cb('save_login hash was not found in localStorage') ;
                if (typeof ls.save_login != 'object') {
                    error = 'save_login was not a hash. save_login = ' + JSON.stringify(ls.save_login) ;
                    ls.save_login = {} ;
                    ls_save() ;
                    for (key in status.permissions) delete status.permissions[key] ;
                    return cb(error) ;
                }
                auth_address = ZeroFrame.site_info.cert_user_id ? ZeroFrame.site_info.auth_address : 'n/a' ;
                user_info = ls.save_login[auth_address] ;
                if (!user_info) return cb('User info for ' + auth_address + ' was not found') ;
                if (auth_address == 'n/a') {
                    // no ZeroNet certificate. login is saved unencrypted in ls
                    permissions = user_info.permissions ;
                    // console.log(pgm + 'unencrypted permissions = ' + JSON.stringify(permissions)) ;
                    if (!permissions) return cb('Permissions for ' + auth_address + ' was not found') ;
                    if (typeof permissions != 'object') {
                        error = 'save_login[' + auth_address + '].permissions is not a hash. permissions = ' + JSON.stringify(permissions) ;
                        user_info.permissions = {} ;
                        ls_save() ;
                        for (key in status.permissions) delete status.permissions[key] ;
                        return cb(error) ;
                    }
                    // copy permissions to status (used in UI)
                    for (key in status.permissions) delete status.permissions[key] ;
                    for (key in permissions) status.permissions[key] = permissions[key] ;
                    // console.log(pgm + 'status.permissions = ' + JSON.stringify(status.permissions));
                    return cb(null) ;
                }
                // ZeroNet certificate present. decrypt permissions
                encrypted_json = user_info.permissions ;
                // console.log(pgm + 'encrypted_json = ' + JSON.stringify(encrypted_json));
                if (!encrypted_json) return cb('No encrypted permissions was found for ' + auth_address) ;
                encrypt1.decrypt_json(encrypted_json, function(json) {
                    var pgm = service + '.get_permissions decrypt_json callback: ' ;
                    var key ;
                    // console.log(pgm + 'json = ' + JSON.stringify(json)) ;
                    if (!json) {
                        for (key in status.permissions) delete status.permissions[key] ;
                        cb('decrypt error. encrypted_json was ' + JSON.stringify(encrypted_json)) ;
                    }
                    else {
                        // copy permissions to status (used in UI)
                        for (key in status.permissions) delete status.permissions[key] ;
                        for (key in json) status.permissions[key] = json[key] ;
                        // console.log(pgm + 'status.permissions = ' + JSON.stringify(status.permissions));
                        cb(null) ;
                    }
                }) ; // decrypt_json callback
            } // get_permissions

            // save permissions in ls (rules for MoneyNetwork wallet operations)
            function save_permissions (cb) {
                var pgm = service + '.save_permissions: ' ;
                var auth_address, unencrypted_permissions ;
                auth_address = ZeroFrame.site_info.cert_user_id ? ZeroFrame.site_info.auth_address : 'n/a' ;
                if (auth_address == 'n/a') {
                    // no cert_user_id. not encrypted
                    ls.save_login[auth_address].permissions = JSON.parse(JSON.stringify(status.permissions)) ;
                    ls_save();
                    return cb();
                }
                // get and add W2 pubkey2 to encryption setup (self encrypt using ZeroNet certificate)
                get_my_pubkey2(function (my_pubkey2) {
                    var pgm = service + '.save_permissions get_my_pubkey2 callback 1: ';
                    var save_w2;
                    encrypt1.setup_encryption({pubkey2: my_pubkey2});
                    // console.log(pgm + 'encrypt1.other_pubkey2 = ' + encrypt1.other_session_pubkey2);

                    // cert_user_id: encrypt permissions
                    unencrypted_permissions = status.permissions;
                    // console.log(pgm + 'unencrypted_permissions = ' + JSON.stringify(unencrypted_permissions)) ;
                    encrypt1.encrypt_json(unencrypted_permissions, [2], function (encrypted_permissions) {
                        var pgm = service + '.save_permissions encrypt_json callback 2: ';
                        ls.save_login[auth_address].permissions = encrypted_permissions;
                        // console.log(pgm + 'encrypted_permissions = ' + JSON.stringify(encrypted_permissions)) ;
                        ls_save();
                        return cb();
                    }); // encrypt_json callback 2

                }) ; // get_my_pubkey2 callback 1

            } // save_permissions

            // get offline transactions from ls (timestamps for long outgoing money transactions)
            function get_offline (cb) {
                var pgm = service + '.get_offline: ' ;
                var error, auth_address, user_info, offline, encrypted_json, key ;
                if (!ls.save_login) return cb('save_login hash was not found in localStorage') ;
                if (typeof ls.save_login != 'object') {
                    error = 'save_login was not a hash. save_login = ' + JSON.stringify(ls.save_login) ;
                    ls.save_login = {} ;
                    ls_save() ;
                    while (status.offline.length) status.offline.shift() ;
                    return cb(error) ;
                }
                auth_address = ZeroFrame.site_info.cert_user_id ? ZeroFrame.site_info.auth_address : 'n/a' ;
                user_info = ls.save_login[auth_address] ;
                if (!user_info) return cb('User info for ' + auth_address + ' was not found') ;
                if (auth_address == 'n/a') {
                    // no ZeroNet certificate. login is saved unencrypted in ls
                    offline = user_info.offline ;
                    // console.log(pgm + 'unencrypted offline = ' + JSON.stringify(offline)) ;
                    if (!offline) return cb('Offline transaction for ' + auth_address + ' was not found') ;
                    if (!Array.isArray(offline)) {
                        error = 'save_login[' + auth_address + '].offline is not an array. offline = ' + JSON.stringify(offline) ;
                        user_info.offline = [] ;
                        ls_save() ;
                        while (status.offline.length) status.offline.shift() ;
                        return cb(error) ;
                    }
                    // copy offline to status (used in UI)
                    for (key in status.offline) delete status.offline[key] ;
                    // console.log(pgm + 'status.offline = ' + JSON.stringify(status.offline));
                    return cb(null) ;
                }
                // ZeroNet certificate present. decrypt offline
                encrypted_json = user_info.offline ;
                // console.log(pgm + 'encrypted_json = ' + JSON.stringify(encrypted_json));
                if (!encrypted_json) return cb('No encrypted offline was found for ' + auth_address) ;
                encrypt1.decrypt_json(encrypted_json, function(json) {
                    var pgm = service + '.get_offline decrypt_json callback: ' ;
                    var i ;
                    // console.log(pgm + 'json = ' + JSON.stringify(json)) ;
                    if (!json) {
                        while (status.offline.length) status.offline.shift() ;
                        cb('decrypt error. encrypted_json was ' + JSON.stringify(encrypted_json)) ;
                    }
                    else {
                        // copy offline to status (used in UI)
                        while (status.offline.length) status.offline.shift() ;
                        for (i=0 ; i<json.length ; i++) status.offline.push(json[i]) ;
                        // console.log(pgm + 'status.offline = ' + JSON.stringify(status.offline));
                        cb(null) ;
                    }
                }) ; // decrypt_json callback
            } // get_offline

            // save offline in ls (rules for MoneyNetwork wallet operations)
            function save_offline (cb) {
                var pgm = service + '.save_offline: ' ;
                var auth_address, unencrypted_offline ;
                auth_address = ZeroFrame.site_info.cert_user_id ? ZeroFrame.site_info.auth_address : 'n/a' ;
                if (auth_address == 'n/a') {
                    // no cert_user_id. not encrypted
                    ls.save_login[auth_address].offline = JSON.parse(JSON.stringify(status.offline)) ;
                    ls_save();
                    return cb();
                }
                // get and add W2 pubkey2 to encryption setup (self encrypt using ZeroNet certificate)
                get_my_pubkey2(function (my_pubkey2) {
                    var pgm = service + '.save_offline get_my_pubkey2 callback 1: ';
                    encrypt1.setup_encryption({pubkey2: my_pubkey2});
                    // console.log(pgm + 'encrypt1.other_pubkey2 = ' + encrypt1.other_session_pubkey2);

                    // cert_user_id: encrypt offline
                    unencrypted_offline = status.offline;
                    // console.log(pgm + 'unencrypted_offline = ' + JSON.stringify(unencrypted_offline)) ;
                    encrypt1.encrypt_json(unencrypted_offline, [2], function (encrypted_offline) {
                        var pgm = service + '.save_offline encrypt_json callback 2: ';
                        ls.save_login[auth_address].offline = encrypted_offline;
                        // console.log(pgm + 'encrypted_offline = ' + JSON.stringify(encrypted_offline)) ;
                        ls_save();
                        return cb();
                    }); // encrypt_json callback 2

                }) ; // get_my_pubkey2 callback 1

            } // save_offline

            // todo: changed ZeroId. clear z_cache.
            var z_cache = {} ; // cache some ZeroNet objects: wallet_data_hub, wallet.json




            // fix "Merger site (MoneyNetwork) does not have permission for merged site: xxx" errors
            // wait for mergerSiteAdd event to finish. see todo: xxxx
            var new_wallet_hub_cbs = {} ; // hub => array with (fileGet) callbacks waiting for hub to be ready

            // demon. dbQuery. check for any json for new wallet data wallet hub before running any fileGet operations
            function monitor_first_hub_event () {
                var pgm = service + '.monitor_first_hub_event: ' ;
                var query ;
                if (!Object.keys(new_wallet_hub_cbs).length) return ; // no more new wallet hubs to monitor

                query =
                    "select substr(directory, 1, instr(directory,'/')-1) as hub, count(*) as rows " +
                    "from json " +
                    "group by substr(directory, 1, instr(directory,'/')-1);" ;
                ZeroFrame.cmd("dbQuery", [query], function (res) {
                    var pgm = service + '.monitor_first_hub_event dbQuery callback: ';
                    var hub, i, cbs, cb;
                    // if (detected_client_log_out(pgm)) return ;
                    if (res.error) {
                        console.log(pgm + "first hub lookup failed: " + res.error);
                        console.log(pgm + 'query = ' + query);
                        for (hub in new_wallet_hub_cbs) console.log(pgm + 'error: ' + new_wallet_hub_cbs[hub].length + ' callbacks are waiting forever for hub ' + hub) ;
                        return ;
                    }
                    for (i=0 ; i<res.length ; i++) {
                        hub = res[i].hub ;
                        if (!new_wallet_hub_cbs[hub]) continue ;
                        console.log(pgm + 'new user data hub ' + hub + ' is ready. ' + new_wallet_hub_cbs[hub].length + ' fileGet operations are waiting in callback queue. running callbacks now') ;
                        // move to temporary cbs array
                        cbs = [] ;
                        while (new_wallet_hub_cbs[hub].length) {
                            cb = new_wallet_hub_cbs[hub].shift() ;
                            cbs.push(cb) ;
                        }
                        delete new_wallet_hub_cbs[hub] ;
                        // run cbs
                        while (cbs.length) {
                            cb = cbs.shift() ;
                            cb() ;
                        }
                    }
                    $timeout(monitor_first_hub_event, 250) ;
                }) ; // dbQuery callback

            } // monitor_first_hub_event

            // ZeroFrame fileGet wrapper. first fileGet request must wait for mergerSiteAdd operation to finish
            var inner_path_re1 = /^data\/users\// ; // invalid inner_path. old before merger-site syntax
            var inner_path_re2 = /^merged-MoneyNetwork\/(.*?)\/data\/users\// ; // extract hub
            function z_file_get (pgm, options, cb) {
                var inner_path, match2, hub ;
                inner_path = options.inner_path ;

                if (inner_path.match(inner_path_re1)) throw pgm + 'Invalid fileGet path. Not a merger-site path. inner_path = ' + inner_path ;

                match2 = inner_path.match(inner_path_re2) ;
                if (match2) {
                    hub = match2[1] ;
                    if (new_wallet_hub_cbs[hub]) {
                        console.log(pgm + 'new wallet hub ' + hub + '. waiting with fileGet request for ' + inner_path) ;
                        new_wallet_hub_cbs[hub].push(function() { z_file_get (pgm, options, cb) }) ;
                        return ;
                    }
                }

                ZeroFrame.cmd("fileGet", options, function (data) {
                    cb(data) ;
                }) ; // fileGet callback
            } // z_file_get

            function get_default_wallet_hub () {
                var pgm = service + '.get_default_wallet_hub: ' ;
                var default_wallet_hub, default_hubs, hub, hubs, i ;
                default_wallet_hub = '1HXzvtSLuvxZfh6LgdaqTk4FSVf7x8w7NJ' ;
                console.log(pgm + 'ZeroFrame.site_info.content = ' + JSON.stringify(ZeroFrame.site_info.content));
                default_hubs = ZeroFrame.site_info.content.settings.default_hubs ;
                if (!default_hubs) return default_wallet_hub ;
                hubs = [] ;
                for (hub in default_hubs) hubs.push(hub) ;
                if (!hubs.length) return default_wallet_hub ;
                i = Math.floor(Math.random() * hubs.length);
                return hubs[i] ;
            } // get_default_wallet_hub
            
            var get_my_wallet_hub_cbs = [] ; // callbacks waiting for query 17 to finish
            function get_my_wallet_hub (cb) {
                var pgm = service + '.get_my_wallet_hub: ' ;
                if (z_cache.my_wallet_data_hub == true) {
                    // get_my_wallet_hub request is already running. please wait
                    get_my_wallet_hub_cbs.push(cb) ;
                    return ;
                }
                if (z_cache.my_wallet_data_hub) return cb(z_cache.my_wallet_data_hub, z_cache.other_wallet_data_hub) ;
                z_cache.my_wallet_data_hub = true ;

                // get a list of MN wallet data hubs
                // ( MN merger sites with title starting with "W2 ")
                ZeroFrame.cmd("mergerSiteList", [true], function (merger_sites) {
                    var pgm = service + '.get_my_wallet_hub mergerSiteList callback 1: ' ;
                    var wallet_data_hubs, hub, query, debug_seq, i ;
                    wallet_data_hubs = [] ;
                    if (!merger_sites || merger_sites.error) console.log(pgm + 'mergerSiteList failed. merger_sites = ' + JSON.stringify(merger_sites)) ;
                    else for (hub in merger_sites) {
                        if (merger_sites[hub].content.title.match(/^W2 /i)) wallet_data_hubs.push(hub);
                    }
                    console.log(pgm + 'wallet_data_hubs = ' + JSON.stringify(wallet_data_hubs));
                    // user_data_hubs = ["1PgyTnnACGd1XRdpfiDihgKwYRRnzgz2zh","1922ZMkwZdFjKbSAdFR1zA5YBHMsZC51uc"]

                    // find wallet data hub for current user
                    // - wallet.json file most exist
                    // - wallet.wallet_address = this site
                    // - latest updated content.json is being used
                    query =
                        "select substr(wallet.directory, 1, instr(wallet.directory,'/')-1) as hub " +
                        "from keyvalue as wallet_address, json as wallet, json as content, keyvalue as modified " +
                        "where wallet_address.key = 'wallet_address' " +
                        "and wallet_address.value = '" + ZeroFrame.site_info.address + "' " +
                        "and wallet.json_id = wallet_address.json_id " +
                        "and wallet.directory like '%/" + ZeroFrame.site_info.auth_address + "' " +
                        "and content.directory = wallet.directory " +
                        "and content.file_name = 'content.json' " +
                        "and modified.json_id = content.json_id " +
                        "and modified.key = 'modified' " +
                        "order by modified.value desc" ;

                    console.log(pgm + 'query 17 (MS OK) = ' + query);
                    ZeroFrame.cmd("dbQuery", [query], function (res) {
                        var pgm = service + '.get_my_wallet_hub dbQuery callback 2: ' ;
                        var i, run_callbacks, wallet_hub_selected, get_and_add_default_wallet_hub ;

                        run_callbacks = function () {
                            var pgm = service + '.get_my_wallet_hub.run_callbacks: ' ;
                            console.log(pgm + 'my_wallet_hub = ' + z_cache.my_wallet_data_hub + ', other_wallet_hub = ' + z_cache.other_wallet_data_hub) ;
                            cb(z_cache.my_wallet_data_hub, z_cache.other_wallet_data_hub) ;
                            while (get_my_wallet_hub_cbs.length) {
                                cb = get_my_wallet_hub_cbs.shift() ;
                                cb(z_cache.my_wallet_data_hub, z_cache.other_wallet_data_hub)
                            }
                        }; // run_callbacks

                        wallet_hub_selected = function () {
                            // user data hub was selected. find a random other user data hub. For user data hub lists. written to data.json file
                            var pgm = service + '.get_my_wallet_hub.wallet_hub_selected: ' ;
                            var other_wallet_data_hubs ;
                            if (wallet_data_hubs.length <= 1) {
                                z_cache.other_wallet_data_hub = z_cache.my_wallet_data_hub ;
                                return run_callbacks() ;
                            }
                            other_wallet_data_hubs = [] ;
                            for (i=0 ; i<wallet_data_hubs.length ; i++) other_wallet_data_hubs.push(wallet_data_hubs[i].hub) ;
                            i = Math.floor(Math.random() * other_wallet_data_hubs.length);
                            z_cache.other_wallet_data_hub = other_wallet_data_hubs[i] ;
                            return run_callbacks() ;
                        }; // wallet_hub_selected

                        get_and_add_default_wallet_hub = function () {
                            var pgm = service + '.get_my_wallet_hub.get_and_add_default_wallet_hub: ' ;
                            var my_wallet_data_hub ;
                            // no wallet_data_hubs (no merger site hubs were found)
                            my_wallet_data_hub = get_default_wallet_hub() ;
                            console.log(pgm + 'my_wallet_data_hub = ' + my_wallet_data_hub) ;
                            ZeroFrame.cmd("mergerSiteAdd", [my_wallet_data_hub], function (res) {
                                var pgm = service + '.get_my_wallet_hub.get_and_add_default_wallet_hub mergerSiteAdd callback: ' ;
                                console.log(pgm + 'res = '+ JSON.stringify(res));

                                if (res == 'ok') {
                                    console.log(pgm + 'new wallet hub ' + my_wallet_data_hub + ' was added. hub must be ready. wait for jsons (dbQuery) before first fileGet request to new wallet hub') ;
                                    if (!new_wallet_hub_cbs[my_wallet_data_hub]) new_wallet_hub_cbs[my_wallet_data_hub] = [] ; // callbacks waiting for mergerSiteAdd operation to finish
                                    // start demon process. waiting for new user data hub to be ready
                                    $timeout(monitor_first_hub_event, 250) ;
                                    z_cache.my_wallet_data_hub = my_wallet_data_hub ;
                                    wallet_hub_selected() ;
                                    return ;
                                }

                                console.log(pgm + 'mergerSiteAdd failed. hub = ' + my_wallet_data_hub + '. error = ' + res) ;
                            }) ; // mergerSiteAdd callback 3
                        }; // get_and_add_default_wallet_hub

                        if (res.error) {
                            console.log(pgm + "wallet data hub lookup failed: " + res.error);
                            console.log(pgm + 'query = ' + query);
                            return get_and_add_default_wallet_hub() ;
                        }
                        if (res.length) {
                            // old wallet
                            z_cache.my_wallet_data_hub = res[0].hub ; // return hub for last updated content.json
                            console.log(pgm + 'hub = ' + z_cache.my_wallet_data_hub) ;
                            return wallet_hub_selected() ;
                        }
                        // new wallet. get wallet data hub from
                        // 1) list of MN merger sites (mergerSiteList)
                        // 2) default_hubs from site_info.content.sessions.default_hubs
                        if (wallet_data_hubs.length) {
                            i = Math.floor(Math.random() * wallet_data_hubs.length);
                            z_cache.my_wallet_data_hub = wallet_data_hubs[i] ;
                            console.log(pgm + 'hub = ' + z_cache.my_wallet_data_hub) ;
                            wallet_hub_selected() ;
                        }
                        else get_and_add_default_wallet_hub() ;
                    }) ; // dbQuery callback 2

                }) ; // mergerSiteList callback 1

            } // get_my_wallet_hub

            // return special merger site path
            var get_user_path_cbs = [] ;
            function get_user_path (cb) {
                var pgm = service + '.user_path: ' ;
                if (!ZeroFrame.site_info) throw pgm + "invalid call. ZeroFrame is not finish loading" ;
                if (!ZeroFrame.site_info.cert_user_id) throw pgm + "invalid call. ZeroId is missing" ;
                if (z_cache.user_path == true) {
                    // wait for previous user_path request to finish
                    get_user_path_cbs.push(cb) ;
                    return ;
                }
                if (z_cache.user_path) return cb(z_cache.user_path) ; // OK
                z_cache.user_path = true ;
                get_my_wallet_hub(function (my_hub) {
                    z_cache.user_path = 'merged-MoneyNetwork/' + my_hub + '/data/users/' + ZeroFrame.site_info.auth_address + '/' ;
                    MoneyNetworkAPILib.config({this_user_path: z_cache.user_path}) ;
                    cb(z_cache.user_path);
                    while (get_user_path_cbs.length) { cb = get_user_path_cbs.shift() ; cb(z_cache.user_path)}
                }) ;
            } // get_user_path

            // sign or publish
            var z_publish_interval = 0 ;
            var z_publish_pending = false ;
            function z_publish (publish, cb) {
                var pgm = service + '.z_publish: ' ;
                var inner_path ;
                if (!cb) cb = function () {} ;
                // get full merger site user path
                get_user_path(function (user_path) {
                    var cmd ;
                    inner_path = user_path + 'content.json' ;
                    if (publish) console.log(pgm + 'publishing ' + inner_path) ;
                    // content.json file must have optional files support
                    encrypt1.add_optional_files_support(function() {
                        // sign or publish
                        cmd = publish ? 'sitePublish' : 'siteSign' ;
                        if (publish) console.log(pgm + inner_path + ' sitePublish started') ;
                        ZeroFrame.cmd(cmd, {inner_path: inner_path}, function (res) {
                            var pgm = service + '.z_publish ' + cmd + ' callback 3: ';
                            console.log(pgm + 'res = ' + res) ;
                            if (res != "ok") {
                                ZeroFrame.cmd("wrapperNotification", ["error", "Failed to " + (publish ? "publish" : "sign") + ": " + res.error, 5000]);
                                if (!publish) return cb(res.error) ; // sign only. must be a serious error
                                // error - repeat sitePublish in 30, 60, 120, 240 etc seconds (device maybe offline or no peers)
                                if (!z_publish_interval) z_publish_interval = 30;
                                else z_publish_interval = z_publish_interval * 2;
                                console.log(pgm + 'Error. Failed to publish: ' + res.error + '. Try again in ' + z_publish_interval + ' seconds');
                                var retry_zeronet_site_publish = function () {
                                    z_publish(publish, cb);
                                };
                                $timeout(retry_zeronet_site_publish, z_publish_interval * 1000);
                                // continue processing while waiting for sitePublish to finish
                                return cb(res.error);
                            }
                            // sign/publish OK
                            if (publish) z_publish_interval = 0 ;
                            else z_publish_pending = true ;
                            cb();

                        }) ; // sitePublish callback 3

                    }) ; // add_optional_files_support callback 2

                }) ; // get_user_path callback 1

            } // z_publish

            var get_content_json_cbs = [] ; // callbacks waiting for first get_content_json request to finish
            function get_content_json (cb) {
                var pgm = service + '.get_content_json: ' ;
                if (z_cache.content_json == true) return get_content_json_cbs.push(cb) ; // wait for first get_content_json request to finish
                if (z_cache.content_json) return cb(z_cache.content_json) ; // wallet.json is already in cache
                z_cache.content_json = true ;
                get_user_path(function (user_path) {
                    var inner_path ;
                    inner_path = user_path + 'content.json' ;
                    z_file_get(pgm, {inner_path: inner_path, required: false}, function (content_str) {
                        var content ;
                        if (!content_str) content = {} ;
                        else {
                            try {content = JSON.parse(content_str) }
                            catch (e) {
                                console.log(pgm + inner_path + ' was invalid. content_str = ' + content_str + ', error = ' + e.message) ;
                                content = {} ;
                            }
                        }
                        z_cache.content_json = content ;
                        cb(z_cache.content_json) ;
                        while (get_content_json_cbs.length) { cb = get_content_json_cbs.shift() ; cb(z_cache.content_json)} ;
                    }) ; // z_file_get callback 2
                }) ; // get_user_path callback 1
            } // get_content_json

            function write_content_json(cb) {
                var pgm = service + '.write_content_json: ';
                var inner_path, data, json_raw, debug_seq;
                data = z_cache.content_json || {};
                json_raw = unescape(encodeURIComponent(JSON.stringify(data, null, "\t")));
                get_user_path(function (user_path) {
                    var pgm = service + '.write_content_json get_user_path callback 1: ';
                    var inner_path ;
                    inner_path = user_path + 'content.json' ;
                    // console.log(pgm + 'calling fileWrite. path = ' + inner_path) ;
                    ZeroFrame.cmd("fileWrite", [inner_path, btoa(json_raw)], function (res) {
                        var pgm = service + '.write_content_json fileWrite callback 2: ';
                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                        cb(res);
                    }); // fileWrite callback 2
                }) ; // get_user_path callback 2
            } // write_content_json

            var get_wallet_json_cbs = [] ; // callbacks waiting for first get_wallet_json request to finish
            function get_wallet_json (cb) {
                var pgm = service + '.get_wallet_json: ' ;
                if (z_cache.wallet_json == true) return get_wallet_json_cbs.push(cb) ; // wait for first get_wallet_json request to finish
                if (z_cache.wallet_json) return cb(z_cache.wallet_json) ; // wallet.json is already in cache
                z_cache.wallet_json = true ;
                get_user_path(function (user_path) {
                    var inner_path ;
                    inner_path = user_path + 'wallet.json' ;
                    z_file_get(pgm, {inner_path: inner_path, required: false}, function (wallet_str) {
                        var wallet ;
                        if (!wallet_str) wallet = {} ;
                        else {
                            try {
                                wallet = JSON.parse(wallet_str) ;
                            }
                            catch (e) {
                                console.log(pgm + 'ignoring invalid wallet.json file ' + inner_path + '. wallet_str = ' + wallet_str + ', error = ' + e.message) ;
                                wallet = {} ;
                            }
                        }
                        z_cache.wallet_json = wallet ;
                        cb(z_cache.wallet_json) ;
                        while (get_wallet_json_cbs.length) { cb = get_wallet_json_cbs.shift() ; cb(z_cache.wallet_json)}
                    }) ; // z_file_get callback 2
                }) ; // get_user_path callback 1
            } // get_wallet_json

            function write_wallet_json(cb) {
                var pgm = service + '.write_wallet_json: ';
                var inner_path, data, json_raw, debug_seq;
                data = z_cache.wallet_json || {};
                json_raw = unescape(encodeURIComponent(JSON.stringify(data, null, "\t")));
                get_user_path(function (user_path) {
                    var pgm = service + '.write_wallet_json get_user_path callback 1: ';
                    var inner_path ;
                    inner_path = user_path + 'wallet.json' ;
                    // console.log(pgm + 'calling fileWrite. path = ' + inner_path) ;
                    ZeroFrame.cmd("fileWrite", [inner_path, btoa(json_raw)], function (res) {
                        var pgm = service + '.write_wallet_json fileWrite callback 2: ';
                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                        cb(res);
                    }); // fileWrite callback 2
                }) ; // get_user_path callback 2
            } // write_wallet_json

            // write public wallet info
            function update_wallet_json(cb) {
                var pgm = service + '.update_wallet_json: ';
                if (!cb) cb = function () {};

                get_my_wallet_hub(function (hub, random_other_hub) {
                    get_wallet_json(function (wallet) {
                        var pgm = service + '.update_wallet_json get_wallet_json callback 2: ';
                        var old_wallet_str, old_wallet_json, error, key, wallet_sha256, query ;
                        console.log(pgm + 'wallet = ' + JSON.stringify(wallet));
                        old_wallet_str = JSON.stringify(wallet) ;
                        old_wallet_json = JSON.parse(old_wallet_str) ;
                        if (wallet) {
                            // validate after read
                            error = MoneyNetworkAPILib.validate_json(pgm, wallet) ;
                            if (error) {
                                // old wallet info is invalid. delete all
                                console.log(pgm + 'deleting invalid wallet.json. error = ' + error) ;
                                for (key in wallet) delete wallet[key]
                            }
                        }
                        wallet.msgtype = 'wallet' ;
                        wallet.wallet_address = ZeroFrame.site_info.address;
                        wallet.wallet_domain = ZeroFrame.site_info.domain;
                        if (!wallet.wallet_domain) delete wallet.wallet_domain ;
                        wallet.wallet_title = ZeroFrame.site_info.content.title;
                        wallet.wallet_description = ZeroFrame.site_info.content.description;
                        wallet.currencies = [{
                            code: 'tBTC',
                            name: 'Test Bitcoin',
                            url: 'https://en.bitcoin.it/wiki/Testnet',
                            fee_info: 'Fee is calculated by external API (btc.com) and subtracted from amount. Calculated from the last X block in block chain. Lowest fee that still had more than an 80% chance to be confirmed in the next block.',
                            units: [
                                { unit: 'BitCoin', factor: 1 },
                                { unit: 'Satoshi', factor: 0.00000001 }
                            ]
                        }];
                        wallet.api_url = 'https://www.blocktrail.com/api/docs' ;
                        if (!wallet.hub) wallet.hub = random_other_hub ;

                        // calc wallet_sha256 signature. sha256 signature can be used instead of wallet_address, wallet_title, wallet_description and wallet_currencies
                        wallet_sha256 = MoneyNetworkAPILib.calc_wallet_sha256 (wallet) ;
                        console.log(pgm + 'wallet_sha256 = ' + wallet_sha256) ;
                        if ((wallet.msgtype == old_wallet_json.msgtype) &&
                            (wallet_sha256 == old_wallet_json.wallet_sha256) &&
                            (wallet.hub == old_wallet_json.hub)) {
                            console.log(pgm + 'ok. no change to public wallet information') ;
                            return cb("ok") ;
                        }
                        else {
                            console.log(pgm + 'updating wallet.json') ;
                            if (wallet.msgtype != old_wallet_json.msgtype) console.log(pgm + 'changed msgtype. old = ' + old_wallet_json.msgtype + ', new = ' + wallet.msgtype) ;
                            if (wallet_sha256 != old_wallet_json.wallet_sha256) console.log(pgm + 'changed wallet_sha256. old = ' + old_wallet_json.wallet_sha256 + ', new = ' + wallet_sha256) ;
                            if (wallet.hub != old_wallet_json.hub) console.log(pgm + 'changed hub. old = ' + old_wallet_json.hub + ', new = ' + wallet.hub) ;
                        }

                        // count number of wallets with this wallet_sha256 signature
                        // there should always be 5 wallets with identical full wallet information (wallet_address, wallet_title, wallet_description, currencies and wallet_sha256)
                        wallet.wallet_sha256 = wallet_sha256 ;
                        query =
                            "select count(*) as no from (" +
                            "  select keyvalue.json_id, count(*) as no " +
                            "  from keyvalue as wallet_sha256, json, keyvalue " +
                            "  where wallet_sha256.key = 'wallet_sha256' " +
                            "  and wallet_sha256.value = '" + wallet_sha256 + "' " +
                            "  and json.json_id = wallet_sha256.json_id " +
                            "  and json.directory like '" + hub + "/%' " +
                            "  and keyvalue.json_id = wallet_sha256.json_id " +
                            "  and keyvalue.value is not null " +
                            "  and keyvalue.key like 'wallet_%' " +
                            "  group by keyvalue.json_id " +
                            "  having count(*) >= 4" +
                            ")" ;
                        console.log(pgm + 'query = ' + query) ;
                        ZeroFrame.cmd("dbQuery", [query], function (res) {
                            var pgm = service + '.update_wallet_json dbQuery callback 3: ';
                            var write_full_info ;
                            // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                            if (res.error || (res.length != 1)) {
                                console.log(pgm + 'wallet sha256 query failed. res = ' + JSON.stringify(res));
                                console.log(pgm + 'query = ' + query);
                                write_full_info = true;
                            }
                            else write_full_info = (res[0].no < 5) ;
                            console.log(pgm + 'write_full_info = ' + write_full_info) ;
                            if (!write_full_info) {
                                // full wallet info is already in database. only wallet_sha256 signature is needed in wallet.json
                                delete wallet.wallet_address ;
                                delete wallet.wallet_domain ;
                                delete wallet.wallet_title ;
                                delete wallet.wallet_description ;
                                delete wallet.currencies ;
                            }
                            if (old_wallet_str == JSON.stringify(wallet)) return cb('ok'); // no change to public wallet information
                            console.log(pgm + 'wallet = ' + JSON.stringify(wallet));
                            // validate before write
                            error = MoneyNetworkAPILib.validate_json(pgm, wallet) ;
                            if (error) return cb('cannot write invalid wallet.json. error = ' + error + ', wallet = ' + JSON.stringify(wallet));
                            write_wallet_json(function (res) {
                                var pgm = service + '.update_wallet_json write_wallet_json callback 4: ';
                                console.log(pgm + 'res = ' + JSON.stringify(res));
                                if (res == "ok") {
                                    console.log(pgm + 'sign now and publish after end of session handshake. see initialize');
                                    z_publish(false, cb);
                                }
                                else cb(res);
                            }); // write_wallet_json callback 4
                        }) ; // dbQuery callback 3
                    }); // get_wallet_json callback 2
                }) ; // get_my_wallet_hub callback 1
            } // update_wallet_json

            // temporary save money transactions in memory and wait for send_mt request. all validations OK and chat msg with money transactions has been sent
            var new_money_transactions = {} ; // money_transactionid => {timestamp: new Date().getTime(), request: request, response: response}

            // listen for incoming messages from MN and other wallet sessions. called from MoneyNetworkAPILib.demon
            // params:
            // - inner_path: inner_path to new incoming message
            // - encrypt2: instance of MoneyNetworkAPI class created with new MoneyNetworkAPI request
            function process_incoming_message (inner_path, encrypt2) {
                var pgm = service + '.process_incoming_message: ';
                var pos, other_user_path, file_timestamp ;

                try {
                    if (encrypt2.destroyed) {
                        // MoneyNetworkAPI instance has been destroyed. Maybe deleted session?
                        console.log(pgm + 'ignoring incoming message ' + inner_path + '. session has been destroyed. reason = ' + encrypt2.destroyed) ;
                        return ;
                    }
                    console.log(pgm + 'processing inner_path = ' + inner_path + (encrypt2.debug ? ' with ' + encrypt2.debug : ''));

                    // check other_user_path. all messages for this session must come from same user directory
                    pos = inner_path.lastIndexOf('/') ;
                    other_user_path = inner_path.substr(0,pos+1) ;
                    // console.log(pgm + 'other_user_path = ' + other_user_path) ;
                    encrypt2.setup_encryption({other_user_path: other_user_path}) ; // set and check

                    // get file timestamp. used in reponse. double link between request and response
                    pos = inner_path.lastIndexOf('.') ;
                    file_timestamp = parseInt(inner_path.substr(pos+1)) ;
                    console.log(pgm + 'file_timestamp = ' + file_timestamp) ;

                    z_file_get(pgm, {inner_path: inner_path, required: false}, function (json_str) {
                        var pgm = service + '.process_incoming_message fileGet callback 1: ';
                        var encrypted_json ;
                        if (!json_str) {
                            console.log(pgm + 'z_file_get ' + inner_path + ' failed') ;
                            return ;
                        }
                        try {
                            encrypted_json = JSON.parse(json_str) ;
                        }
                        catch (e) {
                            console.log(pgm + inner_path + ' is invalid. json_str = ' + json_str + ', error = ' + e.message) ;
                            return ;
                        }
                        // decrypt json
                        encrypt2.decrypt_json(encrypted_json, function (request) {
                            var pgm = service + '.process_incoming_message decrypt_json callback 2: ';
                            var response_timestamp, request_timestamp, request_timeout_at, error, response,
                                old_wallet_status, send_response ;

                            // remove any response timestamp before validation (used in response filename)
                            response_timestamp = request.response ; delete request.response ; // request received. must use response_timestamp in response filename
                            request_timestamp = request.request ; delete request.request ; // response received. todo: must be a response to previous send request with request timestamp in request filename
                            request_timeout_at = request.timeout_at ; delete request.timeout_at ; // request received. when does request expire. how long does other session wait for response

                            // request timeout?
                            if (request_timeout_at < (new Date().getTime())) {
                                console.log(pgm + 'warning. request timeout. ignoring request = ' + JSON.stringify(request) + ', inner_path = ' + inner_path) ;
                                return ;
                            }

                            console.log(pgm + 'request = ' + JSON.stringify(request)) ;
                            response = { msgtype: 'response' } ;

                            // cb: post response callback. used in send_mt after sending OK response to MN
                            send_response = function (error, cb) {
                                if (!response_timestamp) return ; // no response was requested
                                if (error) response.error = error ;
                                if (!cb) cb = function() {} ;

                                // send response to other session
                                encrypt2.send_message(response, {timestamp: response_timestamp, msgtype: request.msgtype, request: file_timestamp, timeout_at: request_timeout_at}, function (res)  {
                                    var pgm = service + '.process_incoming_message send_message callback 3: ';
                                    console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                                    cb() ;
                                }) ; // send_message callback 3

                            }; // send_response

                            // validate and process incoming json message and process
                            error = MoneyNetworkAPILib.validate_json(pgm, request) ;
                            if (error) response.error = 'message is invalid. ' + error ;
                            else if (request.msgtype == 'ping') {
                                // simple ping from MN. checking connection. return OK response
                            }
                            else if (request.msgtype == 'password') {
                                // got a password response from MN. Must be a lost get_password response. todo: 607 matches in last W2 log check!
                                console.log(pgm + 'warning. got a password message. must be a "lost" get_password response. todo: check reason for lost get_password responses') ;
                                response_timestamp = null ;
                            }
                            else if (request.msgtype == 'get_balance') {
                                // get balance request from MN. Return error or balance in test Bitcoins
                                if (!status.permissions || !status.permissions.get_balance) return send_response('get_balance operation is not authorized');
                                old_wallet_status = wallet_info.status ;
                                if (wallet_info.status != 'Open') {
                                    // wallet not open (not created, not logged in etc)
                                    if (!status.permissions.open_wallet) return send_response('open_wallet operation is not authorized');
                                    if (!request.open_wallet) return send_response('Wallet is not open and open_wallet was not requested') ;
                                    else if (!save_wallet_id || !save_wallet_password) return send_response('Wallet is not open and no wallet login was found') ;
                                    else if (request.close_wallet && !status.permissions.close_wallet) return send_response('close_wallet operation was requested but is not authorized') ;
                                    else {
                                        // open test bitcoin wallet (also get_balance request)
                                        btcService.init_wallet(save_wallet_id, save_wallet_password, function (error) {
                                            if (error) {
                                                // open wallet or get_balance request failed
                                                if (wallet_info.status != 'Open') return send_response('Open wallet request failed with error = ' + error) ;
                                                else {
                                                    response.error = 'Get balance request failed with error = ' + error ;
                                                    // close wallet and send error
                                                    btcService.close_wallet(function (res) {
                                                        send_response() ;
                                                    }) ;
                                                }
                                            }
                                            // open wallet + get_balance request OK
                                            response.msgtype = 'balance' ;
                                            response.balance = [ {code: 'tBTC', amount: parseFloat(wallet_info.confirmed_balance)} ] ;
                                            response.balance_at = new Date().getTime() ;
                                            // close wallet and return balance info
                                            if (!request.close_wallet) send_response() ;
                                            else btcService.close_wallet(function (res) { send_response() }) ;
                                        }) ;
                                        return ;
                                    }
                                }
                                else {
                                    // wallet already open. ignore open_wallet and close_wallet flags
                                    btcService.get_balance(function (error) {
                                        if (error) return send_response('Get balance request failed with error = ' + error) ;
                                        // get_balance request OK
                                        response.msgtype = 'balance' ;
                                        response.balance = [ {code: 'tBTC', amount: parseFloat(wallet_info.confirmed_balance)} ] ;
                                        response.balance_at = new Date().getTime() ;
                                        send_response() ;
                                    }) ;
                                    return ;
                                }

                                // wallet_info.status = 'Open' ;

                            }
                            else if (request.msgtype == 'prepare_mt_request') {
                                // step 1 in send money transaction(s) to contact
                                // got a prepare money transactions request from MN. Return error message or json to be included in chat message for each money transaction
                                (function() {
                                    var send_money, request_money, i, money_transaction, jsons, step_1_confirm,
                                        step_2_open_wallet, step_3_get_new_address, step_4_close_wallet, step_n_more ;

                                    // check permissions
                                    send_money = false ;
                                    request_money = false ;
                                    jsons = [] ;
                                    for (i=0 ; i<request.money_transactions.length ; i++) {
                                        money_transaction = request.money_transactions[i] ;
                                        if (money_transaction.action == 'Send') send_money = true ;
                                        if (money_transaction.action == 'Request') request_money = true ;
                                        jsons.push({}) ;
                                    }
                                    console.log(pgm + 'send_money = ' + send_money + ', request_money = ' + request_money) ;
                                    if (send_money && (!status.permissions || !status.permissions.send_money)) return send_response('send_money operation is not authorized');
                                    if (request_money && (!status.permissions || !status.permissions.receive_money)) return send_response('receive_money operation is not authorized');

                                    //request = {
                                    //    "msgtype": "prepare_mt_request",
                                    //    "money_transactions": [{
                                    //        "action": "Send",
                                    //        "code": "tBTC",
                                    //        "amount": "0.00001"
                                    //    }]
                                    //};

                                    // no fee calculation here. is done by blocktrail/btc when sending money and fee is subtracted from amount. added fee_info to wallet.json

                                    // todo: do some validations without contacting external API (Blocktrails Node.js API)
                                    // 1) send money: check amount >= balance
                                    // 2) general: balance - send amount + (request amount-fee) >= 0
                                    // 3) refresh balance before validation
                                    // 4) what about already send but not yet effected money transactions?
                                    //    a) send money: waiting for bitcoin address from other contact
                                    //    b) request money: send bitcoin address to contact. waiting for bitcoin transaction to be submitted to blockchain
                                    // 5) abort send but not yet effected money transactions? abort from wallet / abort from MN / abort from both contacts
                                    // 6) wallet must keep a list of transactions (in process, cancelled and done)
                                    // 7) create a session for direct wallet to wallet communication? (publish is needed when communicating between wallets)
                                    // 8) or use MN chat messages from communication?
                                    // 9) always call get_new_address.
                                    //    - send money: return address in case of aborted operation after send money request has been sent to external API
                                    //    - request money: address for send money operation

                                    // callback chain definitions
                                    step_n_more = function () {
                                        var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_n_more: ';
                                        console.log(pgm + 'jsons = ' + JSON.stringify(jsons)) ;

                                        // ready to send OK response with jsons to MN
                                        // jsons = [{"return_address":"2N23sTaKZT4SG1veLHrAxR1WLfNeqnBE4tT"}]
                                        response.msgtype = 'prepare_mt_response' ;
                                        response.jsons = jsons ;
                                        // remember transactions and wait for send_mt request (chat msg has been sent)
                                        new_money_transactions[request.money_transactionid] = {
                                            timestamp: new Date().getTime(),
                                            request: request,
                                            response: response
                                        } ;
                                        console.log(pgm + 'new_money_transactions = ' + JSON.stringify(new_money_transactions));
                                        //new_money_transactions = {
                                        //    "vjbhtHwEfZUY4iF01hLHH9QBrm02pzslSqshK0Pu6G1QLEoKsFaJcwKiKvef": {
                                        //        "timestamp": 1508082035393,
                                        //        "request": {
                                        //            "msgtype": "prepare_mt_request",
                                        //            "contact": {
                                        //                "alias": "jro test",
                                        //                "cert_user_id": "jro@zeroid.bit",
                                        //                "auth_address": "18DbeZgtVCcLghmtzvg4Uv8uRQAwR8wnDQ"
                                        //            },
                                        //            "open_wallet": true,
                                        //            "money_transactions": [{
                                        //                "action": "Send",
                                        //                "code": "tBTC",
                                        //                "amount": 0.0001
                                        //            }],
                                        //            "money_transactionid": "vjbhtHwEfZUY4iF01hLHH9QBrm02pzslSqshK0Pu6G1QLEoKsFaJcwKiKvef"
                                        //        },
                                        //        "response": {
                                        //            "msgtype": "prepare_mt_response",
                                        //            "jsons": [{"return_address": "2N7YjtMs4irTnudkKwzxBMBaimhiKCuEKK4"}]
                                        //        }
                                        //    }
                                        //};

                                        send_response();
                                    } ; // step_n_more

                                    // step 4: optional close wallet. only if wallet has been opened in step 2
                                    step_4_close_wallet = function() {
                                        if (request.close_wallet) btcService.close_wallet(function (res){ step_n_more() }) ;
                                        else return step_n_more() ;
                                    } ; // step_4_close_wallet

                                    // step 3: get new bitcoin address
                                    // - send money - get return address to be used in case of a partly failed money transaction (multiple money transactions)
                                    // - request money - address to be used in send money operation
                                    step_3_get_new_address = function (i) {
                                        var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_3_get_new_address: ';
                                        if (!i) i = 0 ;
                                        console.log(pgm + 'i = ' + i) ;
                                        if (i >= request.money_transactions.length) return step_4_close_wallet() ;
                                        btcService.get_new_address(function (error, address) {
                                            var money_transaction ;
                                            if (error) return send_response('Could not get a new bitcoin address. error = ' + error) ;
                                            money_transaction = request.money_transactions[i] ;
                                            if (money_transaction.action == 'Send') jsons[i].return_address = address ;
                                            else jsons[i].address = address ;
                                            step_3_get_new_address(i+1) ;
                                        }) ; // get_new_address
                                    } ; // step_3_get_new_address

                                    // step 2: optional open wallet. wallet must be open before get new address request
                                    step_2_open_wallet = function() {
                                        if (wallet_info.status == 'Open') {
                                            // bitcoin wallet is already open. never close an already open wallet
                                            request.close_wallet = false ;
                                            // check balance. only for send money requests
                                            if (!send_money) return step_3_get_new_address() ;
                                            // sending money. refresh balance.
                                            btcService.get_balance(function (error) {
                                                if (error) console.log(pgm + 'warning. sending money and get_balance request failed with error = ' + error);
                                                return step_3_get_new_address();
                                            }) ;
                                        }
                                        else {
                                            // open test bitcoin wallet (also get_balance request)
                                            btcService.init_wallet(save_wallet_id, save_wallet_password, function (error) {
                                                if (error && (wallet_info.status != 'Open')) return send_response('Open wallet request failed with error = ' + error);
                                                if (error && send_money) console.log(pgm + 'warning. sending money and get_balance request failed with error = ' + error);
                                                step_3_get_new_address();
                                            }) ;
                                        }
                                    } ; // step_2_open_wallet

                                    // step 1: optional confirm money transaction (see permissions)
                                    step_1_confirm = function () {
                                        var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_1_confirm: ';
                                        var request2 ;
                                        console.log(pgm + 'todo: check open/close wallet permissions');
                                        if (wallet_info.status != 'Open') {
                                            // wallet not open (not created, not logged in etc)
                                            if (!status.permissions.open_wallet) return send_response('Cannot start money transaction. Open wallet operation is not authorized');
                                            if (!request.open_wallet) return send_response('Cannot start money transaction. Wallet is not open and open_wallet was not requested');
                                            else if (!save_wallet_id || !save_wallet_password) return send_response('Cannot start money transaction. Wallet is not open and no wallet login was found');
                                        }
                                        if (request.close_wallet && !status.permissions.close_wallet) return send_response('Cannot start money transaction. Close wallet operation was requested but is not authorized');
                                        console.log(pgm + 'todo: add transactions details in confirm dialog') ;
                                        if (!status.permissions && !status.permissions.confirm) return step_2_open_wallet() ;
                                        // send confirm notification to MN
                                        request2 = {
                                            msgtype: 'notification',
                                            type: 'info',
                                            message: 'Please confirm money transaction<br>todo: more text',
                                            timeout: 10000
                                        } ;
                                        console.log(pgm + 'sending request2 = ' + JSON.stringify(request2)) ;
                                        encrypt2.send_message(request2, {response: false}, function (response) {
                                            var pgm = service + '.process_incoming_message.' + request.msgtype + '.step_1_confirm send_message callback 1: ';
                                            var message, confirm_status, confirm_timeout_fnk ;
                                            if (response && response.error) return send_response('Confirm transaction failed. error = ' + response.error) ;
                                            // open confirm dialog. handle confirm timeout. wait max 2+10 seconds for confirmation
                                            confirm_status = { done: false } ;
                                            confirm_timeout_fnk = function () {
                                                if (confirm_status.done) return ; // confirm dialog done
                                                confirm_status.done = true ;
                                                send_response('Confirm transaction timeout')
                                            } ;
                                            setTimeout(confirm_timeout_fnk, 12000) ;
                                            // todo: 1) add transaction details to confirm text
                                            message = 'Send .... money transaction to ' + request.contact.alias + '?' ;
                                            ZeroFrame.cmd('wrapperConfirm', [message, 'OK'], function (confirm) {
                                                if (confirm_status.done) return ; // confirm dialog timeout
                                                confirm_status.done = true ;
                                                if (!confirm) return send_response('money transaction was rejected');
                                                // Money transaction was confirmed. continue
                                                step_2_open_wallet() ;
                                            }) ; // wrapperConfirm callback 2
                                        }) ; // send_message callback 1

                                    } ; // step_1_confirm

                                    // start callback chain
                                    step_1_confirm() ;

                                })() ;
                                // wait for callback chain to finish
                                return ;
                            }
                            else if (request.msgtype == 'send_mt') {
                                // step 2 in send money transaction(s) to contact
                                // MN session has just sent chat msg with money transaction(s) to contact.
                                (function(){
                                    var now, elapsed ;
                                    now = new Date().getTime() ;
                                    if (!new_money_transactions[request.money_transactionid]) {
                                        response.error = 'Unknown money transactionid' ;
                                        return
                                    }
                                    // max 10 seconds between prepare_mt_response and send_mt requests
                                    elapsed = now - new_money_transactions[request.money_transactionid].timestamp ;
                                    if (elapsed > 10000) response.error = 'Timeout. Waited ' + Math.round(elapsed/1000) + ' seconds' ;
                                    else {
                                        // OK send_mt request
                                        console.log(pgm + 'sending OK response to ingoing send_mt request') ;
                                        send_response(null, function() {
                                            var step_1_check_port, step_2_get_pubkey, step_3_get_pubkey2,
                                                step_4_save_pubkeys_msg, step_5_save_in_ls, step_6_publish, session_info, i;
                                            console.log(pgm + 'OK send_mt response was send to MN. continue with mt_send post processing') ;

                                            // capture details for new wallet to wallet money transaction
                                            // must be temporary saved in localStorage until money transaction is processed
                                            session_info = {
                                                money_transactionid: request.money_transactionid,
                                                master: true,
                                                money_transactions: []
                                            } ;
                                            for (i=0 ; i<new_money_transactions[request.money_transactionid].request.money_transactions.length ; i++) {
                                                session_info.money_transactions.push({
                                                    action: new_money_transactions[request.money_transactionid].request.money_transactions[i].action,
                                                    code: new_money_transactions[request.money_transactionid].request.money_transactions[i].code,
                                                    amount: new_money_transactions[request.money_transactionid].request.money_transactions[i].amount,
                                                    json: new_money_transactions[request.money_transactionid].response.jsons[i]
                                                }) ;
                                            }

                                            // post send_mt tasks:
                                            // 1: warning if ZeroNet port is closed. optional files are not distributed. maybe use small normal files as a backup?
                                            // 2: encryption layer 1. jsencrypt. generate a short jsencrypt key (1024) bits. only used for this transaction
                                            // 3: encryption layer 2. select random index for cryptmessage public key and find public cryptmessage key
                                            // 4: send offline pubkeys message to other wallet session encrypted with money_transactionid (encryption layer 3) and
                                            //    create a <session filename>.0000000000001 file with transaction status encrypted with money_transactionid (encryption layer 3)
                                            // 5: save transaction in ls
                                            // 6: publish so that other MN and W2 sessions can new the new optional files

                                            // create callback chain step 1-6
                                            step_6_publish = function () {
                                                z_publish (true) ;
                                            } ;
                                            step_5_save_in_ls = function () {
                                                var auth_address ;
                                                delete session_info.pubkey ;
                                                delete session_info.pubkey2 ;
                                                console.log(pgm + 'todo: save in ls. session_info = ' + JSON.stringify(session_info)) ;
                                                if (!ls.w_sessions) ls.w_sessions = {} ;
                                                auth_address = ZeroFrame.site_info.auth_address ;
                                                if (!ls.w_sessions[auth_address]) ls.w_sessions[auth_address] = {} ;
                                                // cryptMessage encrypt session information
                                                //session_info = {
                                                //    "money_transactionid": "gEBJnfARCq7OCixABrBifae9iZVmDg4sAgBH7iWsPV0dCVG4ca0ob1ZPyVYT",
                                                //    "master": true,
                                                //    "money_transactions": [{
                                                //        "action": "Send",
                                                //        "code": "tBTC",
                                                //        "amount": 0.0001,
                                                //        "json": {"return_address": "2N1pCBZrpYXHV51C6CTGnHUajcUURmdbJfi"}
                                                //    }],
                                                //    "ip_external": false,
                                                //    "prvkey": "-----BEGIN RSA PRIVATE KEY-----\nMIICXQIBAAKBgQC5nSiCH+1rn+5M5BfSvWks7JXM2Ot5/W8fR4F/Cp6n1GpiVYGa\nB86qHoj26RO1K2Mj1c58Ovr0r5qaJukRnmv2LtmtybIgkX48f6SR+u7ZaLvI9Ey7\nxLHAcGOJ6bGxRLhSRCjmeGXnmdEn8+gh2enx2Q/PgOlBBgXMxIoK2MLnqQIDAQAB\nAoGAIb+deetsM8Fkhr6CRmMCGJT7t79JMWkPJ1TNCthXeJR6s15wrhz1SqE6rgo6\n9xnocL+TR6tBrfOv3I9umTGA13Yob4ef31eGeknSHnta9qes5qEumM5k20E7XaXp\n3+v6xX6ex7ZzeW53sGvqE5cshP2bK0r6opd1vZEgPwKq+jECQQD6zNVWaiqjwXKr\ncMf2RKKO4EKm5tL8m79nGQbC/Cji7IG5zpfZDZDI+pwgkz4VSLAYG8Pcfx/pxRA2\nS63JESBbAkEAvXZWV/d2PgwnO9S9GKgbz44MOuVO2da4dl8/JjQpTFcrV/0whM8E\niMzyArbHufi8Kk5X/gDTS1aKvN4HEFbXSwJBALOnu0K1tmmrj1rj5TmyHMhAOT6Z\nppWxc8CEmuVeAGPdi2fwZ7HiF88ARorHLvfMI+iBKyJuJgwtT9m1CH45uHUCQAbR\n1qPN9YSgPV1K+A+GJZIgA9Ku5Fq0/ujL3uMKJ55m2NmO9IsjRH+EGQX9/Ex2ZpeD\nQGmVMAXbNJ09xLVS2ucCQQCVvJZ8Iv/07eAo8WbsAtqOwnT/567Oj+vu3GOzwRlA\nXemngpR8aUBDonTF1fAXxU2IwXg+Efgvq4pZxif/pGte\n-----END RSA PRIVATE KEY-----",
                                                //    "userid2": 56,
                                                //    "offline": [1508494633596]
                                                //};
                                                get_my_pubkey2(function (pubkey2) {
                                                    encrypt1.encrypt_json(session_info, [2], function(encrypted_session_info) {
                                                        var sha256 ;
                                                        sha256 = CryptoJS.SHA256(session_info.money_transactionid).toString();
                                                        ls.w_sessions[auth_address][sha256] = encrypted_session_info ;
                                                        ls_save() ;
                                                        step_6_publish() ;
                                                    }) ;
                                                }) ;
                                            } ;
                                            step_4_save_pubkeys_msg = function () {
                                                var request2, offline, encrypt3;
                                                request2 = {
                                                    msgtype: 'pubkeys',
                                                    pubkey: session_info.pubkey, // for JSEncrypt
                                                    pubkey2: session_info.pubkey2 // for cryptMessage
                                                };
                                                console.log(pgm + 'request2 = ' + JSON.stringify(request2));
                                                // setup session instance.
                                                // Only using symmetric encryption in first pubkeys message to other wallet session
                                                // this wallet starts the transaction and is the master in wallet to wallet communication
                                                // todo: 1) add this session keys information to encrypt3
                                                // todo: 2) encrypt3 instance should be saved in ls and should be restored after page reload (step_5_save_in_ls)
                                                session_info.offline = [] ;
                                                encrypt3 = new MoneyNetworkAPI({
                                                    debug: 'encrypt3',
                                                    sessionid: session_info.money_transactionid,
                                                    master: true,
                                                    prvkey: session_info.prvkey,
                                                    userid2: session_info.userid2,
                                                    cb: process_incoming_message,
                                                    extra: { offline: session_info.offline }
                                                });
                                                encrypt3.send_message(request2, {encryptions: [3], offline: session_info.offline}, function (response2) {
                                                    console.log(pgm + 'response2 = ' + JSON.stringify(response2)) ;
                                                    console.log(pgm + 'offline = ' + JSON.stringify(offline)) ;
                                                    step_5_save_in_ls() ;
                                                }); // encrypt_json callback
                                            } ;
                                            step_3_get_pubkey2 = function () {
                                                var r ;
                                                r = Math.random() ;
                                                session_info.userid2 = parseInt(('' + r).substr(2,3)) ; // 0-999
                                                ZeroFrame.cmd("userPublickey", [session_info.userid2 ], function (pubkey2) {
                                                    session_info.pubkey2 = pubkey2 ;
                                                    console.log(pgm + 'status = ' + JSON.stringify(session_info)) ;
                                                    //status = {
                                                    //    "ip_external": true,
                                                    //    "pubkey": "-----BEGIN PUBLIC KEY-----\nMIGeMA0GCSqGSIb3DQEBAQUAA4GMADCBiAKBgGVhj2Ibo5pfV3XEPDbqNcKW0HAa\nk7AaOcvZen3Qz//a2xvsCe+BjNPyLCCk53Tg+CC+8UlU9a9SkSTtBGkV9/AG6i2d\nNF4FdgWUKvIM3qFtabNFnTF7FTcTibQV1YyAMjtFDQYCQmRIClar/uY73gAw1dcx\nw1Hzbn3XasH1lIFRAgMBAAE=\n-----END PUBLIC KEY-----",
                                                    //    "prvkey": "-----BEGIN RSA PRIVATE KEY-----\nMIICWwIBAAKBgGVhj2Ibo5pfV3XEPDbqNcKW0HAak7AaOcvZen3Qz//a2xvsCe+B\njNPyLCCk53Tg+CC+8UlU9a9SkSTtBGkV9/AG6i2dNF4FdgWUKvIM3qFtabNFnTF7\nFTcTibQV1YyAMjtFDQYCQmRIClar/uY73gAw1dcxw1Hzbn3XasH1lIFRAgMBAAEC\ngYBhNxhDP7W2Rk6bwzzqe9RpcC0YEqQkbkGV1Em9dArAkaEiOUmdvWDJrKPb+cVp\nMoE9BVxisXGWWVqNSiq8ijBhaTiLbh5acbIwq0+/M0CbrI8YRZkofjPsVeklK61f\nj/xDgmtWPHGmhHJEpFKCfeu1Py6nHMIZv83VX7PDmMnAQQJBAKiB4biUBc7cgQAC\n6zJmbgUhQn2Vto5h0vbyE2GgNXH45uUhar8x0ThjRx/fi09fR0vQnPRvObNkv8Ij\nyawgpE0CQQCaBTVEBbWQLukseVM+xzM1AoCAp3+Fr7bpdGc22IfeKAsawXNPJ9Sn\nTPLgBn6wJfAasb4L86edtz1V4Sp0cqMVAkEAo2/eS9WeUIaExEsQboD04xrgT8h/\nGVh+czBWZhEq5VGCOekQjUM3Z1a7bIm4qBKEp18+bMLYl0v3xchKWh4K3QJAF4GH\n+ZOtfA3MxF7X15LrO8Hf/sKRccO5dLOxNOujAMK3vyObB4+aotXZk1sqZpPDqy9J\nQ+WxxR48HCk7I36DaQJAbJNN0LiiPgz/NbEPWNuTksnkoOVoIvzP2Q/6UasaKgFp\ncy5C5tuU/NiUTCpAhhozOpg9hL4tuYs2Y+xXteKqFw==\n-----END RSA PRIVATE KEY-----",
                                                    //    "prvkey2": 856,
                                                    //    "pubkey2": "Ak+2Pp57QeaE2o3gSI9Do+RFD4oJbGD9tk0IIDaNgou2"
                                                    //};
                                                    step_4_save_pubkeys_msg() ;
                                                }); // userPublickey
                                            } ;
                                            step_2_get_pubkey = function () {
                                                var crypt ;
                                                crypt = new JSEncrypt({default_key_size: 1024});
                                                crypt.getKey();
                                                session_info.pubkey = crypt.getPublicKey();
                                                session_info.prvkey = crypt.getPrivateKey(); // todo: save prvkey in W2 lS encrypted with ...
                                                step_3_get_pubkey2() ;
                                            } ;
                                            step_1_check_port = function () {
                                                ZeroFrame.cmd("serverInfo", {}, function (server_info) {
                                                    session_info.ip_external = server_info.ip_external ;
                                                    if (!session_info.ip_external) console.log(pgm + 'warning. ZeroNet port is closed. Optional files (money transaction) will not be distributed on ZeroNet. Money transaction may fail');
                                                    // warning. ZeroNet port is closed. Optional files (money transaction) will not be distributed on ZeroNet. Money transaction may fail
                                                    step_2_get_pubkey() ;
                                                }) ;
                                            } ;

                                            // start callback chain
                                            step_1_check_port() ;

                                        }) ; // send_response
                                    }
                                })() ;
                                if ((response.msgtype == 'response') && !response.error) return ; // stop. OK send_mt response has already been sent
                            }
                            else response.error = 'Unknown msgtype ' + request.msgtype ;
                            console.log(pgm + 'response = '  + JSON.stringify(response)) ;

                            send_response() ;

                        }) ; // decrypt_json callback 2
                    }); // z_file_get callback 1

                } // try
                catch (e) {
                    console.log(pgm + e.message) ;
                    console.log(e.stack);
                    throw(e) ;
                } // catch

            } // process_incoming_message
            MoneyNetworkAPILib.config({cb: process_incoming_message}) ;

            // encrypt2 - encrypt messages between MN and W2
            // todo: reset encrypt1 and encrypt2 when cert_user_id is set or changed
            var encrypt2 = new MoneyNetworkAPI({
                debug: 'encrypt2'
            }) ;
            var new_sessionid; // temporary save sessionid received from MN
            var sessionid ; // unique sessionid. also like a password known only by MN and W2 session
            var this_pubkey ;            // W2 JSEncrypt public key used by MN
            var this_pubkey2 ;           // W2 cryptMessage public key used by MN

            // session is saved in localStorage and session information is encrypted with a session password
            // session password = pwd1+pwd2
            // pwd1 is saved in W2 localStorage and cryptMessage encrypted
            // pwd2 is saved in MN localStorage and is symmetric encrypted with pwd1
            // session password is not saved on ZeroNet and is not shared with other users on ZeroNet
            // session can be restored with ZeroNet cert + MN login
            var session_pwd1, session_pwd2 ;

            // read first "pubkeys" message from MN session
            // optional file with file format <other_session_filename>.<timestamp>
            // pubkey used by JSEncrypt (client) and pubkey2 used by cryptMessage (ZeroNet)
            function read_pubkeys (cb) {
                var pgm = service + '.read_pubkeys: ' ;
                if (!cb) cb = function() {} ;

                encrypt2.get_session_filenames(function (this_session_filename, other_session_filename, unlock_pwd2) {
                    var pgm = service + '.read_pubkeys get_session_filenames callback 1: ' ;
                    var query ;
                    console.log(pgm + 'this_session_filename = ' + this_session_filename + ', other_session_filename = ' + other_session_filename) ;
                    query =
                        "select " +
                        "  json.directory," +
                        "  substr(json.directory, 1, instr(json.directory,'/')-1) as hub," +
                        "  substr(json.directory, instr(json.directory,'/data/users/')+12) as auth_address," +
                        "  files_optional.filename, keyvalue.value as modified " +
                        "from files_optional, json, keyvalue " +
                        "where files_optional.filename like '" + other_session_filename + ".%' " +
                        "and json.json_id = files_optional.json_id " +
                        "and keyvalue.json_id = json.json_id " +
                        "and keyvalue.key = 'modified' " +
                        "order by files_optional.filename desc" ;
                    console.log(pgm + 'query = ' + query) ;
                    ZeroFrame.cmd("dbQuery", [query], function (res) {
                        var pgm = service + '.read_pubkeys dbQuery callback 2: ' ;
                        var prefix, other_user_path, inner_path ;
                        prefix = "Error. MN-W2 session handshake failed. " ;
                        // console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                        if (res.error) {
                            console.log(pgm + prefix + 'cannot read pubkeys message. dbQuery failed with ' + res.error) ;
                            console.log(pgm + 'query = ' + query) ;
                            status.sessionid = null ;
                            return cb(status.sessionid) ;
                        }
                        if (res.length == 0) {
                            console.log(pgm + prefix + 'pubkeys message was not found') ;
                            console.log(pgm + 'query = ' + query) ;
                            status.sessionid = null ;
                            return cb(status.sessionid) ;
                        }

                        // mark file as read. generic process_incoming_message will not process this file
                        MoneyNetworkAPILib.wait_for_file({msgtype: 'ignore pubkeys message'}, res[0].filename) ;

                        // first message. remember path to other session user directory. all following messages must come from same user directory
                        other_user_path = 'merged-MoneyNetwork/' + res[0].directory + '/' ;
                        encrypt2.setup_encryption({other_user_path: other_user_path}) ;

                        // read file
                        inner_path = other_user_path + res[0].filename ;
                        // console.log(pgm +  inner_path + ' z_file_get start') ;
                        z_file_get(pgm, {inner_path: inner_path, required: true}, function (pubkeys_str) {
                            var pgm = service + '.read_pubkeys z_file_get callback 3: ' ;
                            var pubkeys, now, content_signed, elapsed, error ;
                            // console.log(pgm + 'pubkeys_str = ' + pubkeys_str) ;
                            if (!pubkeys_str) {
                                console.log(pgm + prefix + 'read pubkeys failed. file + ' + inner_path + ' was not found') ;
                                status.sessionid = null ;
                                return cb(status.sessionid) ;
                            }
                            // check pubkeys message timestamps. must not be old or > now.
                            now = Math.floor(new Date().getTime()/1000) ;
                            content_signed = res[0].modified ;
                            // file_timestamp = Math.floor(parseInt(res[0].filename.substr(11))/1000) ;
                            elapsed = now - content_signed ;
                            if (elapsed < 0) {
                                console.log(pgm + prefix + 'read pubkeys failed. file + ' + inner_path + ' signed in the future. elapsed = ' + elapsed) ;
                                status.sessionid = null ;
                                return cb(status.sessionid) ;
                            }
                            if (elapsed > 60) {
                                console.log(pgm + prefix + 'read pubkeys failed. file + ' + inner_path + ' is too old. elapsed = ' + elapsed) ;
                                status.sessionid = null ;
                                return cb(status.sessionid) ;
                            }
                            // console.log(pgm + 'timestamps: file_timestamp = ' + file_timestamp + ', content_signed = ' + content_signed + ', now = ' + now) ;
                            try {
                                pubkeys = JSON.parse(pubkeys_str) ;
                            }
                            catch (e) {
                                console.log(pgm + prefix + 'read pubkeys failed. file + ' + inner_path + ' is invalid. pubkeys_str = ' + pubkeys_str + ', error = ' + e.message) ;
                                status.sessionid = null ;
                                return cb(status.sessionid) ;
                            }
                            error = MoneyNetworkAPILib.validate_json(pgm, pubkeys) ;
                            if (error) {
                                console.log(pgm + prefix + 'invalid pubkeys message. error = ' + error) ;
                                status.sessionid = null ;
                                return cb(status.sessionid) ;
                            }
                            if (pubkeys.msgtype != 'pubkeys') {
                                console.log(pgm + prefix + 'First message from MN was NOT a pubkeys message. message = ' + JSON.stringify(pubkeys) );
                                status.sessionid = null ;
                                return cb(status.sessionid);
                            }
                            console.log(pgm + 'OK. received public keys from MN') ;
                            console.log(pgm + 'MN public keys: pubkey2 = ' + pubkeys.pubkey2 + ', pubkey = ' + pubkeys.pubkey) ;
                            encrypt2.setup_encryption({pubkey: pubkeys.pubkey, pubkey2: pubkeys.pubkey2}) ;
                            // mark file as read.

                            // return W2 public keys to MN session for full end2end encryption between the 2 sessions
                            console.log(pgm + 'Return W2 public keys to MN for full end-2-end encryption') ;
                            write_pubkeys(cb) ;

                        }) ; // z_file_get callback 3

                    }) ; // dbQuery callback 2


                }) ; // get_session_filenames callback 1

            } // read_pubkeys

            // get public key for JSEncrypt
            function get_my_pubkey () {
                var crypt, prvkey ;
                if (this_pubkey) return this_pubkey ;
                // generate key pair for client to client RSA encryption
                crypt = new JSEncrypt({default_key_size: 1024});
                crypt.getKey();
                this_pubkey = crypt.getPublicKey();
                prvkey = crypt.getPrivateKey();
                // save JSEncrypt private key for decrypt_1
                encrypt2.setup_encryption({prvkey: prvkey}) ;
                return this_pubkey ;
            } // get_my_pubkey

            // get public key for cryptMessage
            var get_my_pubkey2_cbs = [] ; // callbacks waiting for get_my_pubkey2 request
            function get_my_pubkey2 (cb) {
                var pgm = service + '.get_my_pubkey2: ' ;
                if (this_pubkey2 == true) { get_my_pubkey2_cbs.push(cb) ; return } // wait
                if (this_pubkey2) return cb(this_pubkey2) ; // ready
                // get pubkey2
                this_pubkey2 = true ;
                ZeroFrame.cmd("userPublickey", [0], function (my_pubkey2) {
                    var pgm = service + '.get_my_pubkey2 userPublickey callback: ' ;
                    this_pubkey2 = my_pubkey2 ;
                    console.log(pgm + 'encrypt1. setting pubkey2 = ' + my_pubkey2) ;
                    encrypt1.setup_encryption({pubkey2: my_pubkey2}) ;
                    cb(this_pubkey2) ;
                    while (get_my_pubkey2_cbs.length) { cb = get_my_pubkey2_cbs.shift() ; cb(this_pubkey2) }
                }) ;
            } // get_my_pubkey2

            // pubkeys message from W2 to MN. public keys + a session password
            function write_pubkeys(cb) {
                var pgm = service + '.write_pubkeys: ' ;
                if (!cb) cb = function() {} ;
                // collect info before returning W2 public keys information to MN session
                get_user_path(function (user_path) {
                    var my_pubkey = get_my_pubkey() ;
                    get_my_pubkey2(function (my_pubkey2) {
                        encrypt2.add_optional_files_support(function() {
                            var pgm = service + '.write_pubkeys get_my_pubkey2 callback 3: ' ;
                            var request, encrypted_pwd2 ;
                            // W2 password
                            // - pwd1: cryptMessage encryped and saved in W2 localStorage
                            // - pwd2: encrypted with pwd1 and saved in MN.
                            session_pwd1 = generate_random_string(50, true) ;
                            session_pwd2 = generate_random_string(50, true) ;
                            encrypted_pwd2 = MoneyNetworkAPILib.aes_encrypt(session_pwd2, session_pwd1) ;
                            request = {
                                msgtype: 'pubkeys',
                                pubkey: my_pubkey, // for JSEncrypt
                                pubkey2: my_pubkey2, // for cryptMessage
                                password: encrypted_pwd2 // for session restore
                            } ;
                            console.log(pgm + 'request = ' + JSON.stringify(request)) ;
                            encrypt2.send_message(request, {response: true, msgtype: 'pubkeys'}, function (response) {
                                var pgm = service + '.write_pubkeys send_message callback 4: ' ;
                                console.log(pgm + 'response = ' + JSON.stringify(response)) ;
                                if (!response.error) {
                                    // session handshake ok. save session
                                    save_mn_session(function() {cb(true) }) ;
                                }
                                else cb(false) ;
                            }) ; // send_message callback 4

                        }) ; // add_optional_files_support callback 3

                    }) ; // get_my_pubkey2 callback 2

                }) ; // get_user_path callback 1

            } // write_pubkeys

            // save MN session in W2 localStorage
            // - unencrypted:
            //   - W2 pubkey and W2 pubkey2
            //   - MN pubkey and MN pubkey2
            // - encrypted with cryptMessage (ZeroId)
            //   - session_pwd1, unlock_pwd2, this_session_filename, other_session_filename
            // - encrypted with session password
            //   - W2 prvkey
            //   - sessionid
            function save_mn_session(cb) {
                var pgm = service + '.save_mn_session: ' ;
                var array ;
                if (!cb) cb = function() {} ;
                encrypt2.get_session_filenames(function (this_session_filename, other_session_filename, unlock_pwd2) {
                    var pgm = service + '.save_mn_session get_session_filenames callback 1: ' ;

                    // cryptMessage encrypt session_pwd1, this_session_filename and other_session_filename
                    array = [ session_pwd1, unlock_pwd2, this_session_filename, other_session_filename] ;
                    encrypt1.encrypt_2(JSON.stringify(array), function(encrypted_info) {
                        var pgm = service + '.save_mn_session encrypt_2 callback 2: ' ;
                        var auth_address, info, prvkey, password ;
                        if (!ls.mn_sessions) ls.mn_sessions = {} ;
                        auth_address = ZeroFrame.site_info.auth_address ;
                        if (!ls.mn_sessions[auth_address]) ls.mn_sessions[auth_address] = {} ;
                        info = ls.mn_sessions[auth_address] ; // sessions = MN sessions. One for each auth_address
                        info.this_pubkey = this_pubkey ; // W2 (clear text)
                        info.this_pubkey2 = this_pubkey2 ; // W2 (clear text)
                        info.other_pubkey = encrypt2.other_session_pubkey ; // MN (clear text)
                        info.other_pubkey2 = encrypt2.other_session_pubkey2 ; // MN (clear text)
                        info.encrypted_info = encrypted_info ; // W2 (cryptMessage). pwd1, unlock_pwd2, this_session_filename and other_session_filename
                        prvkey = encrypt2.this_session_prvkey ;
                        password = session_pwd1 + session_pwd2 ;
                        info.prvkey = MoneyNetworkAPILib.aes_encrypt(prvkey, password) ; // W2 (symmetric encrypted)
                        info.sessionid = MoneyNetworkAPILib.aes_encrypt(status.sessionid, password); // MN+W2 (symmetric encrypted)
                        console.log(pgm + 'info = ' + JSON.stringify(info)) ;
                        //info = {
                        //    "this_pubkey": "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCZ6pQlnMMT/03KRipfc9/poCZl\nWq9nGpRrzfh5xJEuGkRPluTt4m92NJ6zqutZN4cxMPcfSuogoyqcG8ahb9I8VUXS\nslNDMNmpdk6WRI+ows0CtWJ3qGSJbTKMUAyoFE6plMJ6dCXH85vjLCocsUhEcSVb\nitUlnwGRL/sj7d5GyQIDAQAB\n-----END PUBLIC KEY-----",
                        //    "this_pubkey2": "Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R",
                        //    "other_pubkey": "-----BEGIN PUBLIC KEY-----\nMIIBITANBgkqhkiG9w0BAQEFAAOCAQ4AMIIBCQKCAQBpQDut223gZcYfGTHxqoal\nDFX4PvQY1riWEPVqiO2eXS3E47XJjRUtMSUqzpb011ZxzauTxSXlTL1uunIykTvN\nmsXaNSq/tPIue0zdVSCN4PrJo5FY5P6SYGviZBLzdHZJYqlNk3QPngrBGJl/VBBp\nToPXmN7hog/9rXEGhPyN7GX2AKy3pPFCkXFC9GDlCoEjt0Pq+y5sF/t4iPXyn878\nirWfYbRPisLjnJGqSe23/c6MhP8CTvnbFvpiBcLES7HQk6hqqBBnLe9NLTABbqXK\n6i1LW6+aZRqOX72mMwU+1LTcbQRIW1nG6rtPhaUqiIzeH0g8B743bjmcJagm1foH\nAgMBAAE=\n-----END PUBLIC KEY-----",
                        //    "other_pubkey2": "A4RQ77ia8qK1b3FW/ERL2HdW33jwCyKqxRwKQLzMw/yu",
                        //    "pwd1": "[\"n136va4JjXjbYBGapT8FewLKACA5iCNxNFEg6qmUn7/uydqYOqkCKhcSYkpXFpdd3E7rZgAgoSy20bnoNwIruK/JHRapPz24tWrYv516Cl9hC778IWZFTyU0Rhl21axGIgLAvcFkIKq2cT4OgzYuTt4y5YTqw3JKJUzTK9F5CHLtzgJyyOwcx0VNDRGOcZ1usPx8MlSi95f3sMnBcIAtY8IvNSFvsg==\",\"GH2vevBGncKvjRWqNIRp/A==\",\"gWXNAfcHe1VX+viCiOaqSiUMUoWN4GPi///8nEYCMd3ktZwejzoHNJFV+LskTU4Aw/tmYhj1FOZhoNPBxv0jtg==\"]",
                        //    "prvkey": "U2FsdGVkX195BEgVCqqpVaZ32sZzEBXodkFpz8d436nANHPmCwnyBUAO+t8HLfaNxEtLGBzC5RzQvo8vXwopfz4gO3CoXUdni/0Y1dhXoXKX/OZ5WeDSooJDbOD7XZJQP13qsGdX5cZuR96sMfO546uJ5y8olDW8dZVxrjw6kV0hzbv3rEn3vvLzNwRw5iN+ULtbgRfYzA/3EJ2DDdlzJTVab24th3Qw1DAlEHAoSKKt232OXDOkfSgylFFbWLPrJHOlZ+4broX/w195MkNxAsPvoDKYMr485om7nSifPR2nHMvsMGwueiJTHfcmCwYQ0HFguhViwI/aznw2T+PnqV4nbSKZILoLXlspOoWLBbL1vf6nJa1NE/wfUoWHIZkqccCBiimPc1LbaIy6I539AbRNV9WJSDAdI+TGosFxuvcjZ22jL9nHARCxdW0boQhF+BI5X1mP/LmHwS1d3BSXpLrHlc1kmHqvA5Bl0C2QlpA9b46FyB5yKxPCZKyrLPTMo+KsIAYUPGCo/RV5JlE73s53izY7aSZsXkiLu17p9zFFQXdwIY8ZggY40ZvkJQ3f6gtw1nuU2eT/zhHG+ao62uBziFnVBN/kU4KoIkAeGOKMEgjGvAeliaQ2C2qU0YKOY6gdJGo+bbVepnzBNvcrjkUOQLU7SkQWOe9Nn8TNJ/3VCs+ubGXkL/ItKcHQB3KkILVr///eSXzc1AxJxspv8mQp9Zi0GDk/EcjSIsb61AHTKJXV5SkBmDHDDJHBZ92wUSGnqCQ6dPsvcUt/9YoHjlvlfb++HeYDwixWiQoZssSp4viNrVEhWrHIE3jVGrXKcr4Ojf6HNMaKszHafKSL2weCpApz20l1xu9V9iPXKXk82HNUEaK6BnzjwaCXwFqufEaYkMk+bhu+/FC4trJwIIC//XbH0Aw0ED0QXInghAlW/jv7QBCDKuzhEMFKyQJHAscNLMrVP7cjIrpLeMY1KV2RLNpp0bvCtC7L4q++rkYF5YPqjBMBF0yuOJVk0/1hvzL/d6uClublDAhlR3Tk8gQbcvlVKfXiEUqXt4EnE6N6gv+SyITM9FGVH55CJQcAEcirCLpI7LsUB4xEXYsb3E1jvvEI5OOxsNGEEFiyXoQYIiokH/I/1hiaVXmsBYcjK0eKrRil16EcphoOu+eRpGGurkWEEQI8laIsjKrqUzUm4zesxfzgmBhhlUd3TsIp",
                        //    "sessionid": "U2FsdGVkX1/0a09r+5JZgesSVAoaN7d/jrGpc4x3mhHfQY83Rewr5yMnU2awz9Emru2y69CPpZyYTQh/G/20TPyqua02waHlzATaChw5xYY="
                        //};
                        ls_save() ;
                        cb() ;
                    }) ; // encrypt_2 callback 2

                }) ; // get_session_filenames callback 1

            } // save_mn_session

            // w2 startup 1: check and save any sessionid param and redirect without sessionid in URL
            function is_sessionid() {
                var pgm = service + '.is_sessionid: ' ;
                var sessionid, a_path, z_path ;
                sessionid = $location.search()['sessionid'] ;
                if (!sessionid) return false ; // no sessionid in url
                // new sessionid received from MN. save and redirect without sessionid
                new_sessionid = sessionid ;
                console.log(pgm + 'initialize step 1: new_sessionid = ' + new_sessionid + ' was received from MN') ;
                status.session_handshake = 'Received sessionid from MN' ;
                // redirect
                a_path = '/wallet' ;
                z_path = "?path=" + a_path ;
                $location.path(a_path).search({sessionid:null}) ;
                $location.replace();
                ZeroFrame.cmd("wrapperReplaceState", [{"scrollY": 100}, "Money Network W2", z_path]) ;
                return true;
            } // is_sessionid

            // w2 startup 2: check merger permission. required for most ZeroFrame operations
            function check_merger_permission(cb) {
                var pgm = service + '.check_merger_permission: ';
                if (!cb) cb = function () {};
                var request1 = function (cb) {
                    var pgm = service + '.check_merger_permission.request1: ';
                    ZeroFrame.cmd("wrapperPermissionAdd", "Merger:MoneyNetwork", function (res) {
                        console.log(pgm + 'res = ', JSON.stringify(res));
                        if (res == "Granted") {
                            request2(cb);
                            status.merger_permission = 'Granted';
                        }
                        else cb(false);
                    });
                }; // request1
                var request2 = function (cb) {
                    var pgm = service + '.check_merger_permission.request2: ';
                    get_my_wallet_hub(function (hub) {
                        ZeroFrame.cmd("mergerSiteAdd", [hub], function (res) {
                            console.log(pgm + 'res = ', JSON.stringify(res));
                            cb((res == 'ok'));
                        });
                    });
                }; // request2

                // wait for ZeroFrame.site_info to be ready
                var retry_check_merger_permission = function () {
                    check_merger_permission(cb)
                };
                if (!ZeroFrame.site_info) {
                    $timeout(retry_check_merger_permission, 500);
                    return;
                }
                // if (!ZeroFrame.site_info.cert_user_id) return cb(false); // not logged in

                // console.log(pgm , 'site_info = ' + JSON.stringify(site_info)) ;
                if (ZeroFrame.site_info.settings.permissions.indexOf("Merger:MoneyNetwork") == -1) {
                    status.merger_permission = 'Missing';
                    return request1(cb);
                }
                status.merger_permission = 'Granted';
                ZeroFrame.cmd("mergerSiteList", {}, function (merger_sites) {
                    var pgm = service + '.check_merger_permission mergerSiteList callback 2: ';
                    console.log(pgm + 'merger_sites = ', JSON.stringify(merger_sites));
                    get_my_wallet_hub(function (hub) {
                        if (merger_sites[hub] == "MoneyNetwork") cb(true);
                        else request2(cb);
                    });
                }); // mergerSiteList callback 2
            } // check_merger_permission

            // w2 startup 3: check cert_user_id. Must be present

            // w2 startup 4: update wallet.json

            // w2 startup 5: check old session. restore from localStorage and password from MN
            function is_old_session (cb) {
                var pgm = service + '.is_old_session: ' ;
                var auth_address, info, encrypted_session_pwd1 ;
                if (!ls.mn_sessions) {
                    console.log(pgm + 'no old sesions found in ls. ls = ' + JSON.stringify(ls)) ;
                    return cb() ;
                } // no saved sessions
                if (!ZeroFrame.site_info) {
                    console.log(pgm + 'invalid call. ZeroFrame is still loading') ;
                    return cb() ;
                }
                if (!ZeroFrame.site_info.cert_user_id) {
                    console.log(pgm + 'invalid call. ZeroId not selected. Cert_user_id is null') ;
                    return cb() ;
                }
                auth_address = ZeroFrame.site_info.auth_address ;
                info = ls.mn_sessions[auth_address] ;
                if (!info) {
                    console.log(pgm + 'no old session was found for ' + auth_address) ;
                    return cb() ;
                }
                if (!info.encrypted_info) {
                    console.log(pgm + 'error in saved session for ' + auth_address + '. no encrypted_info. info = ' + JSON.stringify(info)) ;
                    delete ls.mn_sessions[auth_address] ;
                    ls_save() ;
                    return cb() ;
                }

                // ready for session info decrypt and get_password request
                get_user_path(function (user_path) {
                    var pgm = service + '.is_old_session get_user_path callback 1: ' ;
                    status.session_handshake = 'Checking old session' ;
                    // decrypt pwd1, this_session_filename and other_session_filename
                    console.log(pgm + 'found old session. cryptMessage decrypting "info.encrypted_info"') ;
                    encrypt1.decrypt_2(info.encrypted_info, function(decrypted_info) {
                        var pgm = service + '.is_old_session decrypt_2 callback 2: ' ;
                        var array_names, array, i, temp_pwd1, request ;
                        array_names = ['session_pwd1', 'unlock_pwd2', 'this_session_filename', 'other_session_filename'] ;
                        array = JSON.parse(decrypted_info) ; // [ session_pwd1, unlock_pwd2, this_session_filename, other_session_filename]
                        if (array.length != array_names.length) {
                            console.log(pgm + 'error in saved session for ' + auth_address + '. Expected encrypted_info array.length = ' + array_names.length + '. Found length = ' + array.length) ;
                            delete ls.mn_sessions[auth_address] ;
                            ls_save() ;
                            return cb() ;
                        }
                        for (i=0; i<array_names.length ; i++) {
                            if (typeof array[i] != 'string') {
                                console.log(pgm + 'error in saved session for ' + auth_address + '. Expected ' + array_names[i] + ' to be a string. array[' + i + '] = "' + JSON.stringify(array[i]) + '"') ;
                                delete ls.mn_sessions[auth_address] ;
                                ls_save() ;
                                return cb() ;
                            }
                        }
                        temp_pwd1 = array[0] ;
                        // setup temporary encryption for get_password message.
                        // special encryption for get_password request! No sessionid and no JSEncrypt prvkey (normally 3 layers encryption)
                        // request is encrypted with JSEncrypt and cryptMessage (encryptions=[1,2]) using MN public keys
                        // response is encrypted with cryptMessage only (encryptions=[2]) using W2 cryptMessage public key
                        encrypt2 = new MoneyNetworkAPI({
                            debug: 'encrypt2',
                            pubkey: info.other_pubkey,
                            pubkey2: info.other_pubkey2,
                            user_path: user_path,
                            this_session_filename: array[2],
                            other_session_filename: array[3]
                        }) ;
                        // send get_password request. wait for max 10 seconds for response. MN session must be running and user must be logged in with correct account
                        request = {
                            msgtype: 'get_password',
                            pubkey: info.this_pubkey,
                            pubkey2: info.this_pubkey2,
                            unlock_pwd2: array[1]
                        } ;
                        console.log(pgm + 'found old session. sending get_password request to MN. request = ' + JSON.stringify(request)) ;
                        encrypt2.send_message(request, {encryptions:[1,2], response:10000}, function (response) {
                            var pgm = service + '.is_old_session send_message callback 3: ' ;
                            var temp_pwd2, temp_pwd, temp_prvkey, temp_sessionid, encrypted_pwd2, request ;
                            if (response && response.error && response.error.match(/^Timeout /)) {
                                // OK. timeout after 5 seconds. MN session not running or not logged in
                                // error = "Timeout while waiting for response. Request was {\"msgtype\":\"get_password\",\"pubkey\":\"-----BEGIN PUBLIC KEY-----\\nMIGeMA0GCSqGSIb3DQEBAQUAA4GMADCBiAKBgHkYQzcBcq7nc8ktXslYyhkZrlja\\n7fGxu5cxqGVhp/w+905YT4jriF0IosiBeDyPGCJdQCS0IfJ9wMHP1rSIJ7KvLI5R\\nzfFcdqOMliMzEeTva29rkCmZSNw++2x7aIJQO9aExp03bm/l49zh/MbwFnZmrmS7\\nAOGgDzFPapIUQXenAgMBAAE=\\n-----END PUBLIC KEY-----\",\"pubkey2\":\"Ahn94vCUvT+S/nefej83M02n/hP8Jvqc8KbxMtdSsT8R\",\"unlock_pwd2\":\"280eab8147\",\"response\":1469138736361}. Expected response filename was 3253c3b046.1469138736361"
                                console.log(pgm + 'OK. Timeout for get_password request. MN session is not running, busy or not logged in. Cannot restore old session from localStorage');
                                status.session_handshake = 'n/a' ;
                                return cb() ;
                            }
                            if (!response || response.error) {
                                console.log(pgm + 'get_password request failed. response = ' + JSON.stringify(response)) ;
                                status.session_handshake = 'n/a' ;
                                return cb() ;
                            }
                            console.log(pgm + 'got get_password response from MN. response = ' + JSON.stringify(response));
                            // got cryptMessage encrypted pwd2 from MN
                            encrypted_pwd2 = response.password ;
                            temp_pwd2 = MoneyNetworkAPILib.aes_decrypt(encrypted_pwd2, temp_pwd1) ;
                            temp_pwd = temp_pwd1 + temp_pwd2 ;
                            // console.log(pgm + 'got encrypted pwd2 from MN. encrypted_pwd2 = ' + encrypted_pwd2 + ', temp_pwd2 = ' + temp_pwd2) ;
                            // console.log(pgm + 'decrypting prvkey. info.prevkey = ' + info.prvkey + ', temp_pwd = ' + temp_pwd) ;
                            temp_prvkey = MoneyNetworkAPILib.aes_decrypt(info.prvkey, temp_pwd) ;
                            // console.log(pgm + 'decrypted prvkey. prvkey = ' + temp_prvkey) ;

                            temp_sessionid = MoneyNetworkAPILib.aes_decrypt(info.sessionid, temp_pwd) ;
                            status.session_handshake = 'Old session was restored from localStorage' ;
                            status.sessionid = temp_sessionid ;
                            encrypt2 = new MoneyNetworkAPI({
                                debug: 'encrypt2',
                                sessionid: temp_sessionid,
                                pubkey: info.other_pubkey,
                                pubkey2: info.other_pubkey2,
                                prvkey: temp_prvkey,
                                user_path: user_path
                            }) ;

                            // https://github.com/jaros1/Money-Network/issues/208
                            // todo: loaded old session from Ls. No pubkeys message to MN. Send ping to MN instead so that MN known that session is up and running
                            // send ping. timeout max 5 seconds. Expects Timeout ... or OK response
                            request = { msgtype: 'ping' };
                            console.log(pgm + 'restored old session. send ping to MN session with old sessionid ' + status.sessionid) ;
                            encrypt2.send_message(request, {response: 5000}, function (response) {
                                var pgm = service + '.is_old_session send_message callback 4: ' ;
                                if (response && response.error && response.error.match(/^Timeout /)) {
                                    // OK. Timeout. Continue with next session
                                    console.log(pgm + 'ping old sessionid ' + status.sessionid + ' timeout');
                                }
                                else if (!response || response.error) {
                                    // Unexpected error.
                                    console.log(pgm + 'ping old sessionid ' + status.sessionid + ' returned ' + JSON.stringify(response));
                                    info.status = 'Test failed';
                                    info.disabled = true;
                                    return test2_open_url.run();
                                }
                                else console.log(pgm + 'ping old sessionid ' + status.sessionid + ' OK') ;
                                cb(status.sessionid) ;
                            }) ;

                        }) ; // send_message callback 3

                    }) ; // decrypt_2 callback 2

                }) ; // get_user_path callback 1

            } // is_old_session

            // w2 startup 6: check new session
            function is_new_session (cb) {
                var pgm = service + '.is_new_session: ' ;
                var a_path, z_path ;
                if (!cb) cb = function() {} ;
                if (status.sessionid) {
                    console.log(pgm + 'invalid call. sessionid already found') ;
                    cb() ;
                    return false ;
                } // continue old session
                if (!new_sessionid) {
                    console.log(pgm + 'no sessionid was received from MN') ;
                    cb() ;
                    return false ;
                }
                status.sessionid = new_sessionid ;
                MoneyNetworkAPILib.add_session(status.sessionid); // monitor incoming messages for this sessionid
                encrypt2.setup_encryption({sessionid: status.sessionid, debug: true}) ;
                console.log(pgm + 'encrypt2.other_session_filename = ' + encrypt2.other_session_filename) ;
                console.log(pgm + 'sessionid              = ' + status.sessionid) ;
                // read MN public keys message using dbQuery loop and z_file_get operations
                read_pubkeys(function (ok) {
                    var pgm = service + '.is_new_session read_pubkeys callback: ' ;
                    console.log(pgm + 'ok = ' + JSON.stringify(ok)) ;
                    console.log(pgm + 'saved sessionid = ' + status.sessionid) ;
                    cb(status.sessionid) ;
                }) ; // read_pubkeys callback
            } // is_new_session

            // startup sequence 2-6:
            // params:
            // - startup: true: startup, false: changed cert_user_id
            // - cb: callback function. returns sessionid and save_wallet_login
            var old_auth_address ;
            function initialize (startup, cb) {
                var pgm = service + '.initialize: ' ;
                if (!cb) cb = function() {} ;
                if (!startup && old_auth_address && ZeroFrame.site_info && old_auth_address != ZeroFrame.site_info.auth_address) {
                    // reset session variables
                    console.log(pgm + 'changed ZeroNet certificate. reset encrypts and sessionid') ;
                    status.sessionid = null ;
                    encrypt1 = new MoneyNetworkAPI({debug: 'encrypt1'}) ;
                    encrypt2 = new MoneyNetworkAPI({debug: 'encrypt2'}) ;
                }
                // step 2 - check merger permission. session is not possible without merger permission
                console.log(pgm + 'initialize step 2: check merger permission') ;
                check_merger_permission(function(ok) {
                    var pgm = service + '.initialize step 2 check_merger_permission callback 1: ' ;
                    if (!ok) {
                        // no merger permission
                        return cb(null) ;
                    }
                    // step 3 - check zeroNet login
                    console.log(pgm + 'initialize step 3: check ZeroNet login') ;
                    if (!ZeroFrame.site_info.cert_user_id) return cb(null); // not logged in
                    old_auth_address = ZeroFrame.site_info.auth_address ;
                    // step 3.5 - get permissions
                    get_permissions(function (res) {
                        var pgm = service + '.initialize step 3.5 get_permissions callback 2: ' ;
                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                        // step 4 - update wallet.json
                        console.log(pgm + 'initialize step 4: update wallet.json') ;
                        update_wallet_json(function (res) {
                            var pgm = service + '.initialize update_wallet_json callback 3: ' ;
                            var cb2 ;
                            console.log(pgm + 'res = ' + JSON.stringify(res)) ;
                            // extend cb. lookup save_login[].choice (radio group) from ls
                            cb2 = function (sessionid) {
                                var pgm = service + '.initialize.cb2: ' ;
                                var save_wallet_login ;
                                // sessionid found. remember login. must reset session after changed login
                                status.old_cert_user_id = ZeroFrame.site_info.cert_user_id ;
                                if (!ls.save_login) ls.save_login = {} ;
                                // console.log(pgm + 'ls.save_login = ' + JSON.stringify(ls.save_login)) ;
                                if (!ls.save_login[old_auth_address]) ls.save_login[old_auth_address] = { choice: '0' } ;
                                save_wallet_login = ls.save_login[old_auth_address].choice ;
                                ls_save() ;
                                // todo: add cleanup old outgoing money transaction files
                                // delete all outgoing money transaction files except offline transactions
                                // todo: where to save array with offline transactions?

                                // load list of offline transactions from ls (loaded into status.offline array)
                                get_offline(function(error) {
                                    var pgm = service + '.initialize get_offline callback 4: ' ;
                                    var query1 ;
                                    if (error) console.log(pgm + error) ;
                                    // find outgoing money transactions


                                    // query 1. simple get all optional files for current user directory
                                    // todo: optional files and actual files on file system can be out of sync. Should delete files_optional + sign to be sure that optional files and file system matches
                                    query1 =
                                        "select files_optional.filename from json, files_optional " +
                                        "where directory like '" + z_cache.my_wallet_data_hub + "/data/users/" + ZeroFrame.site_info.auth_address + "' " +
                                        "and file_name = 'content.json' " +
                                        "and files_optional.json_id = json.json_id";
                                    console.log(pgm + 'query1 = ' + query1);

                                    ZeroFrame.cmd("dbQuery", [query1], function (res) {
                                        var pgm = service + '.initialize dbQuery callback 5: ' ;
                                        var files, i, re, filename, this_session_filename, timestamp, session_info, sessionid,
                                            session_at, delete_files, delete_file, delete_ok, delete_failed;
                                        if (res.error) {
                                            console.log(pgm + 'query failed. error = ' + res.error);
                                            console.log(pgm + 'query = ' + query1);
                                            return;
                                        }
                                        console.log(pgm + 'res = ' + JSON.stringify(res)) ;

                                        re = new RegExp('^[0-9a-f]{10}.[0-9]{13}$'); // no user seq (MoneyNetworkAPI messages)
                                        files = [] ;
                                        for (i=0 ; i<res.length ; i++) if (res[i].filename.match(re)) files.push(res[i].filename) ;
                                        console.log(pgm + 'files = ' + JSON.stringify(files)) ;

                                        delete_files = [] ;
                                        for (i=0 ; i<files.length ; i++) {
                                            filename = files[i] ;
                                            this_session_filename = filename.substr(0,10) ;
                                            if (this_session_filename != encrypt2.this_session_filename) {
                                                // unknown (old) session
                                                delete_files.push(filename) ;
                                                continue ;
                                            }
                                            timestamp = parseInt(filename.substr(11)) ;
                                            if (timestamp == 0) {
                                                // special file with timestamps for offline transactions (encrypted)
                                                if (!status.offline || !status.offline.offline.length) {
                                                    // no offline transactions. delete file with offline transactions
                                                    delete_files.push(filename) ;
                                                }
                                            }
                                            else if (timestamp < encrypt2.session_at) {
                                                // old outgoing money transaction message
                                                if (!status.offline || (status.offline.indexOf(timestamp) == -1)) {
                                                    // old outgoing message not in offline transactions
                                                    delete_files.push(filename) ;
                                                }
                                            }
                                        } // i
                                        console.log(pgm + 'delete_files = ' + JSON.stringify(delete_files)) ;

                                        // delete file loop
                                        delete_ok = [] ;
                                        delete_failed = [] ;
                                        delete_file = function() {
                                            var pgm = service + '.create_sessions.step_3_find_old_outgoing_files.delete_file: ';
                                            var filename, inner_path, debug_seq ;
                                            if (!delete_files.length) {
                                                // finish deleting old optional files
                                                if (!delete_ok.length) {
                                                    // nothing to sign
                                                    cb(sessionid, save_wallet_login) ;
                                                    if (z_publish_pending) {
                                                        console.log('wallet.json file was updated. publish to distribute info to other users') ;
                                                        z_publish(true);
                                                    }
                                                    return ;
                                                }
                                                // sign
                                                z_publish_pending = true ;
                                                inner_path = 'merged-MoneyNetwork/' + z_cache.my_wallet_data_hub + '/data/users/' + ZeroFrame.site_info.auth_address + '/content.json' ;
                                                self.ZeroFrame.cmd("siteSign", {inner_path: inner_path}, function (res) {
                                                    var pgm = service + '.create_sessions.step_3_find_old_outgoing_files.delete_file siteSign callback: ';
                                                    if (res != 'ok') console.log(pgm + inner_path + ' siteSign failed. error = ' + JSON.stringify(res)) ;
                                                    // done with or without errors
                                                    cb(sessionid, save_wallet_login) ;
                                                    console.log('content.json file was updated (files_optional). publish to distribute info to other users') ;
                                                    z_publish(true);
                                                }) ;
                                                return ;
                                            } // done
                                            filename = delete_files.shift() ;
                                            inner_path = 'merged-MoneyNetwork/' + z_cache.my_wallet_data_hub + '/data/users/' + ZeroFrame.site_info.auth_address + '/' + filename ;
                                            ZeroFrame.cmd("fileDelete", inner_path, function (res) {
                                                if (res == 'ok') delete_ok.push(filename) ;
                                                else {
                                                    console.log(pgm + inner_path + ' fileDelete failed. error = ' + JSON.stringify(res)) ;
                                                    console.log(pgm + 'todo: see MoneyNetworkAPI.send_message.delete_request. Maybe same deleteFile error as in issue 1140. https://github.com/HelloZeroNet/ZeroNet/issues/1140');
                                                    delete_failed.push(filename) ;
                                                }
                                                // continue with next file
                                                delete_file() ;
                                            }); // fileDelete
                                        } ; // delete_file
                                        // start delete file loop
                                        delete_file() ;

                                    }) ; // dbQuery

                                }) ; // get_offline callback 4

                            }; // cb2
                            // check for old (1. priority) or new (2. priority) session
                            // step 5 - check old session
                            console.log(pgm + 'initialize step 5: check old session') ;
                            is_old_session(function(sessionid) {
                                var pgm = service + '.initialize is_old_session callback 4: ' ;
                                console.log(pgm + 'sessionid = ' + JSON.stringify(sessionid)) ;
                                if (sessionid) {
                                    $rootScope.$apply() ;
                                    return cb2(sessionid);
                                } // session was restored from localStorage
                                // step 6 - check new session
                                console.log(pgm + 'initialize step 6: check new session');
                                is_new_session(function(sessionid) {
                                    var pgm = service + '.initialize is_new_session callback 5: ' ;
                                    console.log(pgm + 'sessionid = ' + JSON.stringify(sessionid)) ;
                                    if (!sessionid) return cb2(null);
                                    $rootScope.$apply() ;
                                    save_mn_session(function() { cb2(sessionid)}) ;
                                }) ; // is_new_session callback 5

                            }) ; // is_old_session callback 4

                        }) ; // update_wallet_json callback 3

                    }) ; // get_permissions callback 2

                }) ; // check_merger_permission callback 1

            } // initialize

            function generate_random_string(length, use_special_characters) {
                var character_set = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                if (use_special_characters) character_set += '![]{}#%&/()=?+-:;_-.@$|£' ;
                var string = [], index, char;
                for (var i = 0; i < length; i++) {
                    index = Math.floor(Math.random() * character_set.length);
                    char = character_set.substr(index, 1);
                    string.push(char);
                }
                return string.join('');
            } // generate_random_string

            // send current wallet balance to MN
            function send_balance (cb) {
                var pgm = service + '.send_balance: ' ;
                var request ;
                if (!status.sessionid) return cb('Cannot send balance to MoneyNetwork. No session found') ;
                if (wallet_info.status != 'Open') return cb('Cannot send balance to MoneyNetwork. Wallet not open');
                // send balance to MN
                request = {
                    msgtype: 'balance',
                    balance: [ {code: 'tBTC', amount: parseFloat(wallet_info.confirmed_balance)} ],
                    balance_at: new Date().getTime()
                } ;
                encrypt2.send_message(request, { response: 5000}, function (response) {
                    if (!response || response.error) return cb('Could not send balance to MN. Response = ' + JSON.stringify(response)) ;
                    else cb() ;
                }) ;
            } // send_balance

            // export kW2Service
            return {
                // localStorage functions
                ls_bind: ls_bind,
                ls_get: ls_get,
                ls_save: ls_save,
                get_wallet_login: get_wallet_login,
                save_wallet_login: save_wallet_login,
                // session functions
                generate_random_string: generate_random_string,
                is_sessionid: is_sessionid,
                initialize: initialize,
                get_status: get_status,
                save_permissions: save_permissions,
                send_balance: send_balance
            };

            // end W2Service
        }])

;
