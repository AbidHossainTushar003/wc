package store.wonderfulcollection.admin.presentation.customers

import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator

class CustomersActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scroll = ScrollView(this).apply { setBackgroundColor(0xFF0F172A.toInt()) }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)

        val title = TextView(this).apply {
            text = "👥 Customers Directory"
            textSize = 24f
            setTextColor(0xFF7C3AED.toInt())
            paint.isFakeBoldText = true
            setPadding(0, 0, 0, 24)
        }
        container.addView(title)

        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        container.addView(list)
        setContentView(scroll)

        lifecycleScope.launch {
            ServiceLocator.getCustomersUseCase().onSuccess { customers ->
                customers.forEach { c ->
                    val card = LinearLayout(this@CustomersActivity).apply {
                        orientation = LinearLayout.VERTICAL
                        setBackgroundColor(0xFF1E293B.toInt())
                        setPadding(20, 20, 20, 20)
                        val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                        lp.setMargins(0, 0, 0, 16)
                        layoutParams = lp
                    }
                    val nameTv = TextView(this@CustomersActivity).apply {
                        text = "${c.name} (${c.area}, ${c.city})"
                        textSize = 15f
                        paint.isFakeBoldText = true
                        setTextColor(0xFFF8FAFC.toInt())
                    }
                    val subTv = TextView(this@CustomersActivity).apply {
                        text = "Phone: ${c.phone} | Email: ${c.email}\nTotal Orders: ${c.totalOrders} | Spent: ৳%,.0f".format(c.totalSpent)
                        textSize = 13f
                        setTextColor(0xFF94A3B8.toInt())
                        setPadding(0, 6, 0, 0)
                    }
                    card.addView(nameTv)
                    card.addView(subTv)
                    list.addView(card)
                }
            }
        }
    }
}

