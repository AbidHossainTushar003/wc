package store.wonderfulcollection.admin.presentation.customers

import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator
import store.wonderfulcollection.admin.domain.model.Customer

class CustomersActivity : AppCompatActivity() {

    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var listContainer: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        swipeRefresh = SwipeRefreshLayout(this).apply {
            setBackgroundColor(0xFF0F172A.toInt())
            setOnRefreshListener { loadCustomers() }
        }

        val scroll = ScrollView(this)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)
        swipeRefresh.addView(scroll)
        setContentView(swipeRefresh)

        // Header Row
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 24)
        }

        val btnBack = Button(this).apply {
            text = "← Back"
            textSize = 12f
            setBackgroundColor(0xFF1E293B.toInt())
            setTextColor(0xFF38BDF8.toInt())
            setOnClickListener { finish() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        headerRow.addView(btnBack)

        val title = TextView(this).apply {
            text = "  👥 Customers Directory"
            textSize = 22f
            setTextColor(0xFF7C3AED.toInt())
            paint.isFakeBoldText = true
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(title)
        container.addView(headerRow)

        listContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        container.addView(listContainer)

        loadCustomers()
    }

    private fun loadCustomers() {
        swipeRefresh.isRefreshing = true
        lifecycleScope.launch {
            ServiceLocator.getCustomersUseCase().onSuccess { customers ->
                swipeRefresh.isRefreshing = false
                renderCustomers(customers)
            }.onFailure {
                swipeRefresh.isRefreshing = false
                Toast.makeText(this@CustomersActivity, "Failed to load customers", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun renderCustomers(customers: List<Customer>) {
        listContainer.removeAllViews()
        if (customers.isEmpty()) {
            val emptyTv = TextView(this).apply {
                text = "No registered customers found."
                setTextColor(0xFF94A3B8.toInt())
                textSize = 15f
            }
            listContainer.addView(emptyTv)
            return
        }

        customers.forEach { c ->
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(0xFF1E293B.toInt())
                setPadding(24, 24, 24, 24)
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.setMargins(0, 0, 0, 16)
                layoutParams = lp
            }

            val nameTv = TextView(this).apply {
                text = "${c.name}  📍 (${c.area}, ${c.city})"
                textSize = 16f
                paint.isFakeBoldText = true
                setTextColor(0xFFF8FAFC.toInt())
            }
            card.addView(nameTv)

            val subTv = TextView(this).apply {
                text = "📞 Phone: ${c.phone}  |  ✉️ Email: ${c.email}\n🛍️ Total Orders: ${c.totalOrders}  |  💎 Total Spent: ৳%,.0f".format(c.totalSpent)
                textSize = 13f
                setTextColor(0xFF94A3B8.toInt())
                setPadding(0, 8, 0, 0)
                setLineSpacing(4f, 1f)
            }
            card.addView(subTv)

            listContainer.addView(card)
        }
    }
}
