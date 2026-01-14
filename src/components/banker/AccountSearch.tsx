'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { apiClient } from '@/lib/auth-context';

export interface Account {
    id: number;
    accountNumber: string;
    accountType: string;
    status: string;
    customerName: string;
    availableBalance: number;
}

interface AccountSearchProps {
    onSelect: (account: Account) => void;
    placeholder?: string;
    className?: string;
}

export function AccountSearch({ onSelect, placeholder = "Search accounts...", className }: AccountSearchProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [accounts, setAccounts] = React.useState<Account[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [selectedAccount, setSelectedAccount] = React.useState<Account | null>(null);

    // Debounced search effect
    React.useEffect(() => {
        if (searchQuery.length < 2) {
            setAccounts([]);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await apiClient<{ data: { accounts: Account[] } }>(`/banker/accounts/search?q=${encodeURIComponent(searchQuery)}`);
                if (res.success && res.data) {
                    const data = res.data as any;
                    setAccounts(data.accounts || []);
                }
            } catch (error) {
                console.error("Search failed", error);
                setAccounts([]);
            } finally {
                setLoading(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [searchQuery]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between h-14 text-lg px-4", className)}
                >
                    {selectedAccount ? (
                        <div className="flex items-center gap-2 text-left w-full overflow-hidden">
                            <span className="font-bold font-mono">{selectedAccount.accountNumber}</span>
                            <span className="text-muted-foreground truncate flex-1 pl-2 border-l ml-2">
                                {selectedAccount.customerName}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                                ৳{selectedAccount.availableBalance.toLocaleString()}
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center text-muted-foreground w-full">
                            <Search className="mr-2 h-5 w-5 opacity-50" />
                            {placeholder}
                        </div>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search by account number or name..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        className="h-12"
                    />
                    <CommandList>
                        {loading && (
                            <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Searching...
                            </div>
                        )}
                        {!loading && searchQuery.length >= 2 && accounts.length === 0 && (
                            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                                No accounts found.
                            </CommandEmpty>
                        )}
                        {!loading && searchQuery.length < 2 && accounts.length === 0 && (
                            <div className="py-8 text-center text-sm text-muted-foreground px-4">
                                <p>Type at least 2 characters to search.</p>
                                <p className="text-xs mt-1 opacity-70">Search by Account Number, Name or Customer ID.</p>
                            </div>
                        )}
                        <CommandGroup>
                            {accounts.map((account) => (
                                <CommandItem
                                    key={account.id}
                                    value={account.accountNumber}
                                    onSelect={() => {
                                        setSelectedAccount(account);
                                        onSelect(account);
                                        setOpen(false);
                                    }}
                                    className="p-3 cursor-pointer"
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            selectedAccount?.id === account.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col w-full gap-1">
                                        <div className="flex justify-between items-center w-full">
                                            <span className="font-bold font-mono text-base">{account.accountNumber}</span>
                                            <span className={cn(
                                                "text-xs px-2 py-0.5 rounded-full font-medium",
                                                account.status === 'ACTIVE' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                            )}>
                                                {account.status}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm w-full">
                                            <span className="text-muted-foreground truncate max-w-[180px]">{account.customerName}</span>
                                            <span className="font-semibold text-slate-700">
                                                ৳{account.availableBalance.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
